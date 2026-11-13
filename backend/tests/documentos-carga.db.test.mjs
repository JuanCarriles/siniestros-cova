import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import express from 'express'
import cookieParser from 'cookie-parser'
import pg from 'pg'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioDocumentosGestion } from '../src/modules/documentos/documentos-gestion.service.ts'
import { crearSiniestrosRouter } from '../src/modules/siniestros/siniestros.routes.ts'
import { crearRequerirSesion } from '../src/middlewares/autenticar.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { HttpError } from '../src/utils/httpError.ts'
import { DOCUMENTO_MAX_BYTES } from '@cova/shared/schemas/documentos'

test(
  'documentos del expediente: HTTP, R2, metadatos, permisos, reintentos idempotentes y compensación',
  { timeout: 90000 },
  async () => {
    const original = process.env.DATABASE_URL
    const url = new URL(original)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    const nombre = `cova_test_documentos_${Date.now()}_${process.pid}`
    const db = new pg.Client({ connectionString: original })
    await db.connect()
    let creada = false,
      server
    try {
      await db.query(`CREATE DATABASE "${nombre}"`)
      creada = true
      url.pathname = `/${nombre}`
      process.env.DATABASE_URL = url.href
      await promisify(execFile)(
        process.execPath,
        [
          '../node_modules/prisma/build/index.js',
          'migrate',
          'deploy',
          '--config',
          'prisma.config.ts',
        ],
        { env: process.env },
      )
      const prisma = getPrisma()
      const usuario = (nombres, tipoUsuario) =>
        prisma.usuario.create({
          data: {
            nombres,
            apellidos: 'Prueba',
            tipoUsuario,
            email: `${nombres}@example.invalid`,
            documento: '0',
            telefono: '0',
            contrasena: '-',
            direccion: { create: {} },
          },
        })
      const gestor = await usuario('Gestor', 'GESTOR'),
        ajeno = await usuario('Ajeno', 'GESTOR'),
        admin = await usuario('Admin', 'ADMINISTRADOR'),
        superadmin = await usuario('Super', 'SUPER_ADMINISTRADOR')
      const inactivo = await usuario('Inactivo', 'ADMINISTRADOR')
      await prisma.usuario.update({
        where: { id: inactivo.id },
        data: { eliminado: true, fechaBaja: new Date() },
      })
      const estado = await prisma.estadoSiniestro.create({
        data: { nombre: 'Activo', descripcion: 'Abierto' },
      })
      const cierre = await prisma.estadoSiniestro.create({
        data: { nombre: 'Final', descripcion: 'Cerrado', esCierre: true },
      })
      const aseguradora = await prisma.aseguradora.create({ data: { nombre: 'Documentos' } })
      let numero = 0
      const antes = new Date('2026-10-01T12:00:00Z'),
        ahora = new Date('2026-11-03T15:00:00Z')
      const caso = (extra = {}) =>
        prisma.siniestro.create({
          data: {
            numeroSiniestro: `D-${++numero}`,
            numeroPoliza: 'POL',
            idUsuario: gestor.id,
            idAseguradora: aseguradora.id,
            idEstadoSiniestro: estado.id,
            fechaAsignacion: antes,
            fechaUltimoMovimiento: antes,
            menorEdadInvolucrado: false,
            ...extra,
          },
        })
      const s = await caso()
      const objetos = new Map(),
        borrados = []
      let caido = false,
        despuesDeSubir = async () => {}
      const r2 = {
        subir: async (archivo, carpeta) => {
          if (caido) throw new HttpError(503, 'No se pudo subir a R2')
          const ext = archivo.nombreOriginal.split('.').pop().toLowerCase()
          const clave = `${carpeta}/${randomUUID()}.${ext}`
          objetos.set(clave, Buffer.from(archivo.contenido))
          await despuesDeSubir()
          return {
            clave,
            nombreOriginal: archivo.nombreOriginal,
            tipoExtension: ext,
            mimeType: ext === 'pdf' ? 'application/pdf' : 'application/octet-stream',
            tamanoBytes: BigInt(archivo.contenido.byteLength),
          }
        },
        eliminar: async (clave) => {
          borrados.push(clave)
          objetos.delete(clave)
        },
      }
      const deps = {
        transaccion: (trabajo) => prisma.$transaction(trabajo, { timeout: 15000 }),
        almacenamiento: () => r2,
      }
      let servicio = crearServicioDocumentosGestion(deps, () => ahora)
      const actores = { gestor, ajeno, admin, superadmin }
      let altas = 0
      const app = express()
      app.use(express.json(), cookieParser())
      app.use(
        '/api/siniestros',
        crearSiniestrosRouter({
          requerirSesion: crearRequerirSesion({
            duracionMs: 1000,
            validar: async (token) =>
              actores[token] ? { usuario: actores[token], renovada: false } : null,
          }),
          documentosCarga: {
            comprobar: (...args) => servicio.comprobar(...args),
            subir: (...args) => servicio.subir(...args),
          },
          creacion: {
            subirDocumento: async () => {
              altas++
              return { clave: 'altas/prueba.pdf' }
            },
          },
        }),
      )
      app.use(errorHandler)
      server = app.listen(0, '127.0.0.1')
      await new Promise((ok) => server.once('listening', ok))
      const pdf = await readFile(new URL('fixtures/plantillas/valido.pdf', import.meta.url))
      const subir = (quien, id, idCarga = randomUUID(), opciones = {}) => {
        const data = new FormData()
        const contenido = opciones.contenido ?? pdf
        data.append(
          'archivo',
          new Blob([opciones.gzip ? gzipSync(contenido) : contenido]),
          opciones.nombre ?? 'Declaración á.pdf',
        )
        if (opciones.extra) data.append('idUsuario', String(superadmin.id))
        if (opciones.dos) data.append('archivo', new Blob([pdf]), 'otro.pdf')
        return fetch(`http://127.0.0.1:${server.address().port}/api/siniestros/${id}/documentos`, {
          method: 'POST',
          headers: {
            ...(quien ? { cookie: `cova_sesion=${quien}` } : {}),
            'X-Id-Carga': idCarga,
            'X-Archivo-Compresion': opciones.gzip ? 'gzip' : 'identity',
          },
          body: data,
        })
      }
      assert.equal((await subir(null, s.id)).status, 401)
      assert.equal((await subir('ajeno', s.id)).status, 403)
      assert.equal((await subir('gestor', s.id, 'incorrecto')).status, 400)
      assert.equal((await subir('gestor', s.id, randomUUID(), { extra: true })).status, 400)
      assert.equal((await subir('gestor', s.id, randomUUID(), { dos: true })).status, 400)
      assert.equal(
        (await subir('gestor', s.id, randomUUID(), { contenido: Buffer.from('Esto no es un PDF') }))
          .status,
        400,
      )
      assert.equal(
        (
          await subir('gestor', s.id, randomUUID(), {
            contenido: Buffer.alloc(DOCUMENTO_MAX_BYTES + 1),
            gzip: true,
          })
        ).status,
        413,
      )
      assert.equal(
        (
          await subir('gestor', s.id, randomUUID(), {
            contenido: Buffer.alloc(DOCUMENTO_MAX_BYTES + 1),
          })
        ).status,
        413,
      )
      assert.equal(await prisma.documentoSiniestro.count(), 0)
      assert.equal(objetos.size, 0)
      const idCarga = randomUUID()
      const primera = await subir('gestor', s.id, idCarga, { gzip: true })
      assert.equal(primera.status, 201)
      const respuesta = await primera.json()
      assert.deepEqual(Object.keys(respuesta), ['id'])
      const doc = await prisma.documentoSiniestro.findUniqueOrThrow({ where: { id: respuesta.id } })
      assert.equal(doc.nombreOriginal, 'Declaración á.pdf')
      assert.equal(doc.idUsuario, gestor.id)
      assert.equal(doc.idSiniestro, s.id)
      assert.equal(doc.tamanoBytes, BigInt(pdf.length))
      assert.equal(doc.fechaCarga.toISOString(), ahora.toISOString())
      assert.ok(
        doc.urlArchivoSinDominio.startsWith(
          `dev/siniestros/${s.numeroSiniestro}-${s.numeroPoliza}/`,
        ),
      )
      assert.ok(!doc.urlArchivoSinDominio.includes('://'))
      assert.deepEqual(objetos.get(doc.urlArchivoSinDominio), pdf)
      const actualizado = await prisma.siniestro.findUniqueOrThrow({ where: { id: s.id } })
      assert.equal(actualizado.fechaUltimoMovimiento.toISOString(), ahora.toISOString())
      assert.equal(actualizado.revision, 0)
      assert.equal(
        await prisma.historialSiniestro.count({
          where: { idSiniestro: s.id, tipoEvento: 'DOCUMENTO' },
        }),
        1,
      )
      const avisos = await prisma.notificacion.findMany({
        where: { idSiniestro: s.id },
        orderBy: { idUsuario: 'asc' },
      })
      assert.deepEqual(
        avisos.map((n) => n.idUsuario),
        [admin.id, superadmin.id].sort((a, b) => a - b),
      )
      assert.ok(
        avisos.every(
          (n) =>
            n.tipoNotificacion === 'DOCUMENTO_NUEVO' &&
            !n.leida &&
            !n.revisada &&
            n.fechaCreacion.toISOString() === ahora.toISOString() &&
            n.mensaje.includes(doc.nombreOriginal) &&
            n.mensaje.includes(s.numeroSiniestro),
        ),
      )
      const repetida = await subir('gestor', s.id, idCarga, { gzip: true })
      assert.equal(repetida.status, 200)
      assert.deepEqual(await repetida.json(), respuesta)
      assert.equal(await prisma.documentoSiniestro.count(), 1)
      assert.equal(objetos.size, 1)
      assert.equal(await prisma.historialSiniestro.count(), 1)
      assert.equal(await prisma.notificacion.count(), 2)
      assert.equal((await subir('gestor', s.id, idCarga, { nombre: 'otro.pdf' })).status, 409)
      assert.equal((await subir('admin', s.id, idCarga)).status, 409)

      caido = true
      const idFallido = randomUUID()
      assert.equal((await subir('gestor', s.id, idFallido)).status, 503)
      caido = false
      assert.equal((await subir('gestor', s.id, idFallido)).status, 201)
      assert.equal(await prisma.documentoSiniestro.count(), 2)
      const simultanea = randomUUID()
      const carrera = await Promise.all([
        subir('gestor', s.id, simultanea),
        subir('gestor', s.id, simultanea),
      ])
      assert.deepEqual(carrera.map((r) => r.status).sort(), [200, 201])
      assert.deepEqual(await carrera[0].json(), await carrera[1].json())
      assert.equal(await prisma.documentoSiniestro.count(), 3)
      assert.equal(objetos.size, 3)
      assert.equal(await prisma.historialSiniestro.count(), 3)
      assert.equal(await prisma.notificacion.count(), 6)
      for (const rol of ['admin', 'superadmin']) {
        const nombre = `Carga de ${rol}.pdf`
        assert.equal((await subir(rol, s.id, randomUUID(), { nombre })).status, 201)
        const avisos = await prisma.notificacion.findMany({
          where: { mensaje: { contains: nombre } },
          orderBy: { idUsuario: 'asc' },
        })
        assert.deepEqual(
          avisos.map((n) => n.idUsuario),
          [gestor.id, rol === 'admin' ? superadmin.id : admin.id].sort((a, b) => a - b),
        )
      }

      const cerrado = await caso({ idEstadoSiniestro: cierre.id }),
        baja = await caso({ eliminado: true, fechaBaja: ahora })
      assert.equal((await subir('gestor', cerrado.id)).status, 409)
      assert.equal((await subir('admin', baja.id)).status, 409)
      const reasignado = await caso()
      const objetosAntes = objetos.size
      despuesDeSubir = async () => {
        await prisma.siniestro.update({
          where: { id: reasignado.id },
          data: { idUsuario: ajeno.id },
        })
      }
      assert.equal((await subir('gestor', reasignado.id)).status, 403)
      assert.equal(
        await prisma.documentoSiniestro.count({ where: { idSiniestro: reasignado.id } }),
        0,
      )
      assert.equal(objetos.size, objetosAntes)
      despuesDeSubir = async () => {}
      const rolCambiado = await caso()
      despuesDeSubir = async () => {
        await prisma.usuario.update({ where: { id: admin.id }, data: { tipoUsuario: 'GESTOR' } })
      }
      assert.equal((await subir('admin', rolCambiado.id)).status, 403)
      assert.equal(
        await prisma.documentoSiniestro.count({ where: { idSiniestro: rolCambiado.id } }),
        0,
      )
      assert.equal(await prisma.notificacion.count({ where: { idSiniestro: rolCambiado.id } }), 0)
      assert.equal(objetos.size, objetosAntes)
      await prisma.usuario.update({
        where: { id: admin.id },
        data: { tipoUsuario: 'ADMINISTRADOR' },
      })
      despuesDeSubir = async () => {}
      const rollback = await caso()
      servicio = crearServicioDocumentosGestion(
        {
          ...deps,
          transaccion: (trabajo) =>
            prisma.$transaction((tx) =>
              trabajo(
                new Proxy(tx, {
                  get: (obj, key) =>
                    key === 'historialSiniestro'
                      ? {
                          create: async () => {
                            throw new Error('Falla simulada')
                          },
                        }
                      : Reflect.get(obj, key),
                }),
              ),
            ),
        },
        () => ahora,
      )
      assert.equal((await subir('gestor', rollback.id)).status, 503)
      assert.equal(objetos.size, objetosAntes)
      assert.equal(
        await prisma.documentoSiniestro.count({ where: { idSiniestro: rollback.id } }),
        0,
      )
      assert.equal(
        (
          await prisma.siniestro.findUniqueOrThrow({ where: { id: rollback.id } })
        ).fechaUltimoMovimiento.toISOString(),
        antes.toISOString(),
      )
      assert.ok(borrados.length >= 2)
      // Una confirmación perdida después del commit no debe borrar el archivo que ya quedó registrado.
      let perderConfirmacion = true
      servicio = crearServicioDocumentosGestion(
        {
          ...deps,
          transaccion: async (trabajo) => {
            const resultado = await deps.transaccion(trabajo)
            if (perderConfirmacion && resultado?.reutilizado === false) {
              perderConfirmacion = false
              throw new Error('Confirmación del commit perdida')
            }
            return resultado
          },
        },
        () => ahora,
      )
      const respuestaPerdida = randomUUID()
      assert.equal((await subir('gestor', s.id, respuestaPerdida)).status, 503)
      const guardadoSinConfirmacion = await prisma.documentoSiniestro.findUniqueOrThrow({
        where: { idCarga: respuestaPerdida },
      })
      assert.ok(objetos.has(guardadoSinConfirmacion.urlArchivoSinDominio))
      const notificacionesAntesDeReintentar = await prisma.notificacion.count()
      const recuperado = await subir('gestor', s.id, respuestaPerdida)
      assert.equal(recuperado.status, 200)
      assert.equal((await recuperado.json()).id, guardadoSinConfirmacion.id)
      assert.equal(await prisma.notificacion.count(), notificacionesAntesDeReintentar)

      const idNombreOriginal = randomUUID()
      const conEspacios = await subir('gestor', s.id, idNombreOriginal, {
        nombre: '  Acta original.pdf',
      })
      assert.equal(conEspacios.status, 201)
      assert.equal(
        (
          await prisma.documentoSiniestro.findUniqueOrThrow({
            where: { idCarga: idNombreOriginal },
          })
        ).nombreOriginal,
        '  Acta original.pdf',
      )
      assert.equal(
        (await subir('gestor', s.id, idNombreOriginal, { nombre: '  Acta original.pdf' })).status,
        200,
      )

      // Documento, historial, movimiento y avisos se revierten si no se pueden generar las notificaciones.
      const sinAviso = await caso(),
        objetosAntesDelFallo = objetos.size
      servicio = crearServicioDocumentosGestion(
        {
          ...deps,
          transaccion: (trabajo) =>
            deps.transaccion((tx) =>
              trabajo(
                new Proxy(tx, {
                  get: (obj, key) =>
                    key === 'notificacion'
                      ? {
                          createMany: async () => {
                            throw new Error('Falla de avisos')
                          },
                        }
                      : Reflect.get(obj, key),
                }),
              ),
            ),
        },
        () => ahora,
      )
      assert.equal((await subir('gestor', sinAviso.id)).status, 503)
      assert.equal(
        await prisma.documentoSiniestro.count({ where: { idSiniestro: sinAviso.id } }),
        0,
      )
      assert.equal(
        await prisma.historialSiniestro.count({ where: { idSiniestro: sinAviso.id } }),
        0,
      )
      assert.equal(await prisma.notificacion.count({ where: { idSiniestro: sinAviso.id } }), 0)
      assert.equal(
        (
          await prisma.siniestro.findUniqueOrThrow({ where: { id: sinAviso.id } })
        ).fechaUltimoMovimiento.toISOString(),
        antes.toISOString(),
      )
      assert.equal(objetos.size, objetosAntesDelFallo)

      // La ruta nueva no intercepta las cargas del alta preexistente.
      assert.equal((await subir('admin', 'alta')).status, 201)
      assert.equal(altas, 1)
    } finally {
      if (server) await new Promise((ok) => server.close(ok))
      await disconnectPrisma()
      process.env.DATABASE_URL = original
      if (creada) await db.query(`DROP DATABASE "${nombre}" WITH (FORCE)`)
      await db.end()
    }
  },
)
