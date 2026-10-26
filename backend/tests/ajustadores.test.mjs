import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import { crearRequerirSesion } from '../src/middlewares/autenticar.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { crearAjustadoresRouter } from '../src/modules/ajustadores/ajustadores.routes.ts'

// Las reglas de negocio se prueban contra PostgreSQL en ajustadores.db.test.mjs. Acá, permisos y validación de
// entrada con un servicio falso que registra lo que recibe.
function servicioFalso() {
  const llamadas = []
  const registrar =
    (nombre, respuesta) =>
    async (...args) => {
      llamadas.push([nombre, ...args])
      return respuesta
    }
  return {
    llamadas,
    servicio: {
      listar: registrar('listar', []),
      siniestrosActivos: registrar('siniestrosActivos', {
        casosActivos: 0,
        pagina: 1,
        porPagina: 5,
        siniestros: [],
      }),
      crear: registrar('crear', { id: 1 }),
      modificar: registrar('modificar', { id: 1 }),
      darDeBaja: registrar('darDeBaja'),
      reactivar: registrar('reactivar'),
    },
  }
}

const usuarios = {
  admin: { id: 1, nombres: 'A', apellidos: 'A', email: 'a@x.test', tipoUsuario: 'ADMINISTRADOR' },
  super: {
    id: 2,
    nombres: 'S',
    apellidos: 'S',
    email: 's@x.test',
    tipoUsuario: 'SUPER_ADMINISTRADOR',
  },
  gestor: { id: 3, nombres: 'G', apellidos: 'G', email: 'g@x.test', tipoUsuario: 'GESTOR' },
}
const sesionesFalsas = {
  duracionMs: 1000,
  async validar(token) {
    return usuarios[token] ? { usuario: usuarios[token], renovada: false } : null
  },
}

async function servidor(servicio) {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(
    '/api/ajustadores',
    crearAjustadoresRouter({ servicio, requerirSesion: crearRequerirSesion(sesionesFalsas) }),
  )
  app.use(errorHandler)
  const http = app.listen(0, '127.0.0.1')
  await new Promise((ok) => http.once('listening', ok))
  const base = `http://127.0.0.1:${http.address().port}/api/ajustadores`
  return {
    pedir: (quien, ruta = '', init = {}) =>
      fetch(`${base}${ruta}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(quien ? { cookie: `cova_sesion=${quien}` } : {}),
        },
      }),
    cerrar: () => new Promise((ok) => http.close(ok)),
  }
}

const json = (body) => ({ body: JSON.stringify(body) })
const valido = {
  nombres: ' Ricardo ',
  apellidos: 'Bengoechea',
  email: 'rbengoechea@ejemplo.com',
  telefono: '11 4382-5510',
  idAseguradora: '3',
}

test('permisos: sin sesión 401, gestor 403 (ni lee ni escribe); admin y superadmin acceden', async (t) => {
  const { servicio, llamadas } = servicioFalso()
  const api = await servidor(servicio)
  t.after(api.cerrar)
  for (const [quien, esperado] of [
    [null, 401],
    ['inventada', 401],
    ['gestor', 403],
  ]) {
    assert.equal((await api.pedir(quien)).status, esperado)
    assert.equal((await api.pedir(quien, '', { method: 'POST', ...json(valido) })).status, esperado)
    assert.equal((await api.pedir(quien, '/1/baja', { method: 'PATCH' })).status, esperado)
    assert.equal((await api.pedir(quien, '/1/siniestros-activos')).status, esperado)
  }
  assert.equal(llamadas.length, 0)
  assert.equal((await api.pedir('admin')).status, 200)
  assert.equal((await api.pedir('super')).status, 200)
})

test('entrada: valida el formulario con el esquema compartido antes de llegar al servicio', async (t) => {
  const { servicio, llamadas } = servicioFalso()
  const api = await servidor(servicio)
  t.after(api.cerrar)

  assert.equal((await api.pedir('admin', '', { method: 'POST', ...json(valido) })).status, 201)
  assert.deepEqual(llamadas.pop(), ['crear', { ...valido, nombres: 'Ricardo', idAseguradora: 3 }])

  const sinAseguradora = await api.pedir('admin', '', {
    method: 'POST',
    ...json({ ...valido, idAseguradora: '' }),
  })
  assert.equal(sinAseguradora.status, 400)
  assert.deepEqual((await sinAseguradora.json()).details.idAseguradora, ['Elegí una aseguradora'])
  for (const malo of [
    { ...valido, email: 'no-es-email' },
    { ...valido, nombres: '   ' },
    { ...valido, telefono: 'x'.repeat(31) },
    { ...valido, eliminado: true },
  ]) {
    assert.equal((await api.pedir('admin', '', { method: 'POST', ...json(malo) })).status, 400)
  }

  assert.equal((await api.pedir('admin', '/1', { method: 'PATCH', ...json({}) })).status, 400)
  assert.equal(
    (await api.pedir('admin', '/1', { method: 'PATCH', ...json({ telefono: '0' }) })).status,
    200,
  )
  assert.deepEqual(llamadas.pop(), ['modificar', 1, { telefono: '0' }])
  assert.equal((await api.pedir('admin', '/abc/baja', { method: 'PATCH' })).status, 400)
  assert.equal((await api.pedir('admin', '?incluirBajas=si')).status, 400)
  assert.equal(llamadas.length, 0)

  assert.equal((await api.pedir('admin', '?incluirBajas=true')).status, 200)
  assert.equal((await api.pedir('admin', '/2/baja', { method: 'PATCH' })).status, 204)
  assert.equal((await api.pedir('admin', '/2/reactivacion', { method: 'PATCH' })).status, 204)
  assert.deepEqual(llamadas, [
    ['listar', true],
    ['darDeBaja', 2],
    ['reactivar', 2],
  ])
})

test('API: detalle paginado de casos del ajustador, sin caché ni parámetros inventados', async (t) => {
  const { servicio, llamadas } = servicioFalso()
  const api = await servidor(servicio)
  t.after(api.cerrar)
  for (const ruta of [
    '/x/siniestros-activos',
    '/1/siniestros-activos?pagina=-1',
    '/1/siniestros-activos?pagina=1000001',
    '/1/siniestros-activos?otra=1',
  ]) {
    assert.equal((await api.pedir('admin', ruta)).status, 400)
  }
  assert.equal(llamadas.length, 0)
  const respuesta = await api.pedir('super', '/7/siniestros-activos?pagina=2')
  assert.equal(respuesta.status, 200)
  assert.equal(respuesta.headers.get('cache-control'), 'no-store')
  assert.deepEqual(llamadas.at(-1), ['siniestrosActivos', 7, 2])
})
