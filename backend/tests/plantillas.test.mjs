import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import { crearPlantillasRouter } from '../src/modules/plantillas/plantillas.routes.ts'
import { crearServicioPlantillas } from '../src/modules/plantillas/plantillas.service.ts'
import { validarArchivoPlantilla } from '../src/modules/plantillas/validar-archivo.ts'
import { crearRequerirSesion } from '../src/middlewares/autenticar.ts'
import { HttpError } from '../src/utils/httpError.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { PLANTILLA_MAX_BYTES, plantillaListadoSchema } from '../../shared/src/schemas/plantillas.ts'

const actores = {
  admin: {
    id: 4,
    nombres: 'María',
    apellidos: 'René',
    email: 'admin@example.invalid',
    tipoUsuario: 'ADMINISTRADOR',
  },
  super: {
    id: 1,
    nombres: 'Julia',
    apellidos: 'Cova',
    email: 'super@example.invalid',
    tipoUsuario: 'SUPER_ADMINISTRADOR',
  },
  gestor: {
    id: 6,
    nombres: 'Juan',
    apellidos: 'Pérez',
    email: 'gestor@example.invalid',
    tipoUsuario: 'GESTOR',
  },
}
const leer = (ext) => readFile(new URL(`./fixtures/plantillas/valido.${ext}`, import.meta.url))
const entrada = async (ext) => ({ nombreOriginal: `válido.${ext}`, contenido: await leer(ext) })

function preparar({
  fallaBase = false,
  fallaR2 = false,
  rolActual,
  archivoAusente = false,
  fallaConsultaR2 = false,
  fallaEliminarR2 = false,
  fallaBajaBase = false,
} = {}) {
  const llamadas = []
  let fila
  const prisma = {
    usuario: {
      findFirst: async ({ where }) => {
        const actor = Object.values(actores).find((a) => a.id === where.id)
        return actor ? { tipoUsuario: rolActual ?? actor.tipoUsuario } : null
      },
    },
    documentoPlantilla: {
      create: async ({ data }) => {
        llamadas.push(['crear', data])
        if (fallaBase) throw Error('No guardar')
        fila = {
          id: 8,
          ...data,
          fechaCarga: new Date('2026-10-23T13:00:00Z'),
          usuario: actores.admin,
        }
        return fila
      },
      findMany: async ({ where }) => {
        assert.equal(where.eliminado, false)
        return fila ? [fila] : []
      },
      deleteMany: async ({ where }) => {
        llamadas.push(['retirar', where])
        if (where.OR) assert.equal(where.eliminado, false)
        assert.deepEqual(where.OR ?? [{ id: where.id, urlArchivo: where.urlArchivo }], [
          { id: 8, urlArchivo: 'plantillas/uuid.pdf' },
        ])
        if (fallaBajaBase) {
          fallaBajaBase = false
          throw new Error('Falla transitoria de la base')
        }
        const count = fila ? 1 : 0
        fila = undefined
        return { count }
      },
      findFirst: async ({ where }) => {
        assert.equal(where.eliminado, false)
        return where.id === 8 ? fila : null
      },
    },
  }
  const r2 = {
    subir: async (archivo, carpeta) => {
      llamadas.push(['subir', archivo.nombreOriginal, carpeta])
      if (fallaR2) throw Error('R2 no disponible')
      return {
        clave: 'plantillas/uuid.pdf',
        nombreOriginal: archivo.nombreOriginal,
        tipoExtension: archivo.nombreOriginal.split('.').pop(),
        tamanoBytes: BigInt(archivo.contenido.length),
      }
    },
    comprobarExistencia: async (clave) => {
      llamadas.push(['comprobar', clave])
      if (archivoAusente)
        throw new HttpError(
          404,
          'El archivo no está disponible. Pedile a un administrador que vuelva a cargarlo.',
        )
      if (fallaConsultaR2) throw new HttpError(503, 'No se pudo consultar R2')
    },
    eliminar: async (clave) => {
      llamadas.push(['eliminar', clave])
      if (fallaEliminarR2) throw new HttpError(503, 'No se pudo eliminar de R2')
    },
    firmarDescarga: async (clave) => {
      llamadas.push(['firmar', clave])
      return { url: 'https://r2.example.invalid/firmada', venceEnSegundos: 60 }
    },
  }
  return { llamadas, servicio: crearServicioPlantillas({ prisma, almacenamiento: () => r2 }) }
}
async function servidor(opciones) {
  const preparado = preparar(opciones)
  const app = express()
  app.use(express.json(), cookieParser())
  app.use(
    '/api/plantillas',
    crearPlantillasRouter({
      servicio: preparado.servicio,
      requerirSesion: crearRequerirSesion({
        duracionMs: 1000,
        validar: async (token) =>
          actores[token] ? { usuario: actores[token], renovada: false } : null,
      }),
    }),
  )
  app.use(errorHandler)
  const http = app.listen(0, '127.0.0.1')
  await new Promise((ok) => http.once('listening', ok))
  return {
    ...preparado,
    pedir: (quien, ruta = '', init = {}) =>
      fetch(`http://127.0.0.1:${http.address().port}/api/plantillas${ruta}`, {
        ...init,
        headers: { ...(quien ? { cookie: `cova_sesion=${quien}` } : {}), ...init.headers },
      }),
    cerrar: () => new Promise((ok) => http.close(ok)),
  }
}
async function formulario(
  ext = 'pdf',
  { contenido, nombre = `válido.${ext}`, cambios = {}, sinArchivo = false } = {},
) {
  const datos = new FormData()
  datos.set('encabezado', ' Carta a tercero ')
  datos.set('descripcion', ' Modelo para intimar al tercero. ')
  for (const [clave, valor] of Object.entries(cambios)) datos.set(clave, valor)
  if (!sinArchivo)
    datos.set(
      'archivo',
      new Blob([contenido ?? (await leer(ext))], { type: 'application/octet-stream' }),
      nombre,
    )
  return { method: 'POST', body: datos }
}

test('tipo real: acepta PDF, JPG, PNG, DOCX y XLSX; rechaza extensiones camufladas y ZIP incompleto', async () => {
  for (const ext of ['pdf', 'jpg', 'png', 'docx', 'xlsx'])
    await validarArchivoPlantilla(await entrada(ext))
  await validarArchivoPlantilla({ ...(await entrada('jpg')), nombreOriginal: 'foto.JPEG' })
  for (const archivo of [
    { nombreOriginal: 'virus.pdf', contenido: Buffer.from('MZ esto no es PDF') },
    { nombreOriginal: 'cambiado.docx', contenido: await leer('xlsx') },
    { nombreOriginal: 'cambiado.png', contenido: await leer('jpg') },
    { nombreOriginal: 'vacio.pdf', contenido: Buffer.alloc(0) },
    { nombreOriginal: 'grande.pdf', contenido: Buffer.alloc(PLANTILLA_MAX_BYTES + 1) },
    { nombreOriginal: 'incompleto.docx', contenido: Buffer.from('PK\x03\x04incompleto') },
    { nombreOriginal: 'pagina.html', contenido: Buffer.from('<html/>') },
  ])
    await assert.rejects(validarArchivoPlantilla(archivo), { status: 400 })
})

test('HTTP: permisos del servidor; el gestor puede consultar y descargar pero no cargar', async (t) => {
  const api = await servidor()
  t.after(api.cerrar)
  for (const quien of [null, 'inventada']) {
    assert.equal((await api.pedir(quien)).status, 401)
    assert.equal((await api.pedir(quien, '', await formulario())).status, 401)
  }
  assert.equal((await api.pedir('gestor', '', await formulario())).status, 403)
  assert.equal(api.llamadas.length, 0)
  for (const quien of ['admin', 'super'])
    assert.equal((await api.pedir(quien, '', await formulario())).status, 201)
  assert.equal((await api.pedir('gestor')).status, 200)
  assert.equal((await api.pedir('gestor', '/8/descarga')).status, 200)
  assert.equal((await api.pedir('admin', '/999/descarga')).status, 404)
  assert.equal((await api.pedir('admin', '/abc/descarga')).status, 400)
})

test('HTTP: guarda encabezado, descripción, fecha del servidor y autor de sesión; no expone la clave', async (t) => {
  const api = await servidor()
  t.after(api.cerrar)
  const respuesta = await api.pedir('admin', '', await formulario())
  assert.equal(respuesta.status, 201, JSON.stringify(await respuesta.clone().json()))
  assert.equal(respuesta.headers.get('cache-control'), 'no-store')
  const datos = plantillaListadoSchema.parse(await respuesta.json())
  assert.equal(datos.encabezado, 'Carta a tercero')
  assert.equal(datos.descripcion, 'Modelo para intimar al tercero.')
  assert.equal(datos.nombreOriginal, 'válido.pdf')
  assert.equal(datos.subidoPor.id, actores.admin.id)
  assert.equal(datos.fechaCarga, '2026-10-23T13:00:00.000Z')
  assert.equal(datos.tamanoBytes, (await leer('pdf')).length)
  assert.equal(datos.urlArchivo, undefined)
  const guardado = api.llamadas.find(([accion]) => accion === 'crear')[1]
  assert.equal(guardado.urlArchivo, 'plantillas/uuid.pdf')
  assert.equal(guardado.fechaCarga, undefined)
})

test('HTTP: archivo único, tipo real, campos estrictos y límite exacto de 10 MB antes de R2', async (t) => {
  const api = await servidor()
  t.after(api.cerrar)
  for (const opciones of [
    { sinArchivo: true },
    { cambios: { encabezado: ' ' } },
    { cambios: { descripcion: ' ' } },
    { cambios: { idUsuario: '99' } },
    { cambios: { fechaCarga: '2020-01-01' } },
    { nombre: 'virus.pdf', contenido: Buffer.from('MZ falso PDF') },
  ])
    assert.equal((await api.pedir('admin', '', await formulario('pdf', opciones))).status, 400)
  const doble = await formulario()
  doble.body.append('archivo', new Blob([await leer('png')]), 'otra.png')
  assert.equal((await api.pedir('admin', '', doble)).status, 400)
  assert.equal(
    (
      await api.pedir(
        'admin',
        '',
        await formulario('pdf', { contenido: Buffer.alloc(PLANTILLA_MAX_BYTES + 1) }),
      )
    ).status,
    413,
  )
  assert.equal(api.llamadas.length, 0)
  const exacto = Buffer.alloc(PLANTILLA_MAX_BYTES)
  ;(await leer('pdf')).copy(exacto)
  assert.equal(
    (await api.pedir('admin', '', await formulario('pdf', { contenido: exacto }))).status,
    201,
  )
})

test('servicio: rol vigente, compensación si falla la base y sin registro cuando R2 falla', async () => {
  const degradado = preparar({ rolActual: 'GESTOR' })
  await assert.rejects(
    degradado.servicio.subir(
      4,
      { encabezado: 'Prueba', descripcion: 'Prueba' },
      await entrada('pdf'),
    ),
    { status: 403 },
  )
  assert.equal(degradado.llamadas.length, 0)
  const sinBase = preparar({ fallaBase: true })
  await assert.rejects(
    sinBase.servicio.subir(
      4,
      { encabezado: 'Prueba', descripcion: 'Prueba' },
      await entrada('pdf'),
    ),
    { status: 503 },
  )
  assert.deepEqual(sinBase.llamadas.at(-1), ['eliminar', 'plantillas/uuid.pdf'])
  const sinR2 = preparar({ fallaR2: true })
  await assert.rejects(
    sinR2.servicio.subir(4, { encabezado: 'Prueba', descripcion: 'Prueba' }, await entrada('pdf')),
  )
  assert.equal(
    sinR2.llamadas.some(([accion]) => accion === 'crear'),
    false,
  )
})

test('descarga: si el registro existe pero falta el objeto, responde 404 en la aplicación y no entrega una URL', async (t) => {
  const api = await servidor({ archivoAusente: true })
  t.after(api.cerrar)
  assert.equal((await api.pedir('admin', '', await formulario())).status, 201)
  const respuesta = await api.pedir('gestor', '/8/descarga')
  assert.equal(respuesta.status, 404)
  const datos = await respuesta.json()
  assert.match(datos.error, /no está disponible/)
  assert.equal(datos.url, undefined)
  assert.equal(
    api.llamadas.some(([accion]) => accion === 'firmar'),
    false,
  )
  assert.deepEqual(api.llamadas.at(-1), ['comprobar', 'plantillas/uuid.pdf'])
})

test('descarga: falla de R2 no se confunde con archivo ausente ni permite firmar', async (t) => {
  const api = await servidor({ fallaConsultaR2: true })
  t.after(api.cerrar)
  assert.equal((await api.pedir('admin', '', await formulario())).status, 201)
  assert.equal((await api.pedir('admin', '/8/descarga')).status, 503)
  assert.equal(
    api.llamadas.some(([accion]) => accion === 'firmar'),
    false,
  )
})

test('sincronización HTTP: un archivo eliminado en R2 desaparece del listado y de la base', async (t) => {
  const api = await servidor({ archivoAusente: true })
  t.after(api.cerrar)
  assert.equal((await api.pedir('admin', '', await formulario())).status, 201)
  const respuesta = await api.pedir('gestor')
  assert.equal(respuesta.status, 200)
  assert.deepEqual(await respuesta.json(), [])
  assert.equal(api.llamadas.filter(([accion]) => accion === 'retirar').length, 1)
  assert.equal((await api.pedir('admin', '/8/descarga')).status, 404)
  assert.deepEqual(await (await api.pedir('admin')).json(), [])
})

test('sincronización: una falla de conexión o permisos conserva todos los registros', async (t) => {
  const api = await servidor({ fallaConsultaR2: true })
  t.after(api.cerrar)
  assert.equal((await api.pedir('admin', '', await formulario())).status, 201)
  assert.equal((await api.pedir('admin')).status, 503)
  assert.equal(
    api.llamadas.some(([accion]) => accion === 'retirar'),
    false,
  )
})

test('sincronización: máximo cinco consultas simultáneas; un error cancela toda la limpieza', async () => {
  let enCurso = 0
  let maximo = 0
  let bajas = 0
  let permitirConsultar = false
  const filas = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    encabezado: `Modelo ${i + 1}`,
    descripcion: '',
    nombreOriginal: 'modelo.pdf',
    tipoExtension: 'pdf',
    tamanoBytes: 8n,
    fechaCarga: new Date(),
    urlArchivo: `plantillas/${i + 1}.pdf`,
    usuario: actores.admin,
  }))
  const servicio = crearServicioPlantillas({
    prisma: {
      usuario: { findFirst: async () => ({ tipoUsuario: 'ADMINISTRADOR' }) },
      documentoPlantilla: {
        findMany: async () => filas,
        deleteMany: async ({ where }) => {
          bajas++
          assert.deepEqual(where.OR, [{ id: 1, urlArchivo: 'plantillas/1.pdf' }])
          return { count: 1 }
        },
      },
    },
    almacenamiento: () => ({
      comprobarExistencia: async (clave) => {
        enCurso++
        maximo = Math.max(maximo, enCurso)
        try {
          await new Promise((ok) => setImmediate(ok))
          if (clave === 'plantillas/1.pdf') throw new HttpError(404, 'Ausente')
          if (!permitirConsultar && clave === 'plantillas/8.pdf')
            throw new HttpError(503, 'Sin conexión')
        } finally {
          enCurso--
        }
      },
    }),
  })
  await assert.rejects(servicio.listar(4), { status: 503 })
  assert.equal(bajas, 0, 'ni siquiera se retira la ausencia confirmada en el lote anterior')
  permitirConsultar = true
  const listado = await servicio.listar(4)
  assert.deepEqual(
    listado.map((fila) => fila.id),
    [2, 3, 4, 5, 6, 7, 8],
  )
  assert.equal(listado[0].urlArchivo, undefined)
  assert.ok(maximo <= 5)
  assert.equal(bajas, 1)
})

test('eliminar HTTP: solo admin y superadmin; id válido; clave tomada de la base y borrado idempotente', async (t) => {
  const api = await servidor()
  t.after(api.cerrar)
  assert.equal((await api.pedir('admin', '', await formulario())).status, 201)
  const inicio = api.llamadas.length
  for (const [quien, esperado] of [
    [null, 401],
    ['inventada', 401],
    ['gestor', 403],
  ]) {
    assert.equal((await api.pedir(quien, '/8', { method: 'DELETE' })).status, esperado)
  }
  assert.equal((await api.pedir('admin', '/abc', { method: 'DELETE' })).status, 400)
  assert.equal(api.llamadas.length, inicio)
  assert.equal(
    (
      await api.pedir('admin', '/8', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlArchivo: 'siniestros/1/otro.pdf' }),
      })
    ).status,
    204,
  )
  assert.deepEqual(api.llamadas.slice(inicio), [
    ['eliminar', 'plantillas/uuid.pdf'],
    ['retirar', { id: 8, urlArchivo: 'plantillas/uuid.pdf' }],
  ])
  assert.deepEqual(await (await api.pedir('gestor')).json(), [])
  assert.equal((await api.pedir('super', '/8', { method: 'DELETE' })).status, 204)
  assert.equal(api.llamadas.filter(([accion]) => accion === 'eliminar').length, 1)
  assert.equal((await api.pedir('super', '', await formulario())).status, 201)
  assert.equal((await api.pedir('super', '/8', { method: 'DELETE' })).status, 204)
})

test('eliminar: una degradación de rol antes del pedido bloquea el borrado en el servicio', async () => {
  const api = preparar({ rolActual: 'GESTOR' })
  await assert.rejects(
    api.servicio.eliminar(4, 8),
    (error) => error.status === 403 && /eliminar/.test(error.message),
  )
  await assert.rejects(api.servicio.eliminar(999, 8), { status: 401 })
  assert.equal(api.llamadas.length, 0)
})

test('eliminar: si falla R2 se conserva el registro; si falla la base se puede reintentar', async (t) => {
  const sinR2 = await servidor({ fallaEliminarR2: true })
  t.after(sinR2.cerrar)
  await sinR2.pedir('admin', '', await formulario())
  assert.equal((await sinR2.pedir('admin', '/8', { method: 'DELETE' })).status, 503)
  assert.equal(
    sinR2.llamadas.some(([accion]) => accion === 'retirar'),
    false,
  )
  assert.equal((await (await sinR2.pedir('admin')).json()).length, 1)
  const sinBase = await servidor({ fallaBajaBase: true })
  t.after(sinBase.cerrar)
  await sinBase.pedir('admin', '', await formulario())
  assert.equal((await sinBase.pedir('admin', '/8', { method: 'DELETE' })).status, 503)
  assert.equal((await sinBase.pedir('admin', '/8', { method: 'DELETE' })).status, 204)
  assert.deepEqual(await (await sinBase.pedir('admin')).json(), [])
})
