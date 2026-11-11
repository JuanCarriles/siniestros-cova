import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'
import express from 'express'
import cookieParser from 'cookie-parser'
import { crearServicioNotificaciones } from '../src/modules/notificaciones/notificaciones.service.ts'
import { crearNotificacionesRouter } from '../src/modules/notificaciones/notificaciones.routes.ts'
import { crearRequerirSesion } from '../src/middlewares/autenticar.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import {
  bandejaNotificacionesSchema,
  consultaNotificacionesSchema,
} from '@cova/shared/schemas/bandeja-notificaciones'

test(
  'CU-08: filtros, lectura/revisión independientes, privacidad, roles vigentes y paginación por HTTP',
  { timeout: 90000 },
  async (t) => {
    const original = process.env.DATABASE_URL
    assert.ok(original)
    const url = new URL(original)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    const nombre = `cova_test_notificaciones_${Date.now()}_${process.pid}`
    const control = new pg.Client({ connectionString: original })
    await control.connect()
    let creada = false,
      server
    try {
      await control.query(`CREATE DATABASE "${nombre}"`)
      creada = true
      url.pathname = '/' + nombre
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
      const db = getPrisma()
      const usuario = (nombre, tipoUsuario) =>
        db.usuario.create({
          data: {
            nombres: nombre,
            apellidos: 'Prueba',
            email: nombre + '@example.invalid',
            tipoUsuario,
            contrasena: '-',
            documento: '0',
            telefono: '0',
            direccion: { create: {} },
          },
        })
      const gestor = await usuario('Gestor', 'GESTOR'),
        otro = await usuario('Otro', 'GESTOR'),
        admin = await usuario('Admin', 'ADMINISTRADOR'),
        superadmin = await usuario('Super', 'SUPER_ADMINISTRADOR')
      const estado = await db.estadoSiniestro.create({
        data: { nombre: 'En tratamiento', descripcion: 'Activo' },
      })
      const aseguradora = await db.aseguradora.create({ data: { nombre: 'Prueba' } })
      let numero = 0
      const caso = (idUsuario, extra = {}) =>
        db.siniestro.create({
          data: {
            numeroSiniestro: 'NOT-' + ++numero,
            numeroPoliza: 'P',
            idUsuario,
            idAseguradora: aseguradora.id,
            idEstadoSiniestro: estado.id,
            fechaAsignacion: new Date(),
            menorEdadInvolucrado: false,
            ...extra,
          },
        })
      const propio = await caso(gestor.id),
        ajeno = await caso(otro.id),
        eliminando = await caso(gestor.id, { eliminacionEnCurso: true })
      const aviso = (idUsuario, idSiniestro, extra = {}) =>
        db.notificacion.create({
          data: {
            idUsuario,
            idSiniestro,
            mensaje: 'Aviso de prueba',
            tipoNotificacion: 'CAMBIO_ESTADO',
            leida: false,
            revisada: false,
            ...extra,
          },
        })
      const a = await aviso(gestor.id, propio.id)
      const b = await aviso(gestor.id, propio.id, {
        tipoNotificacion: 'DOCUMENTO_NUEVO',
        leida: true,
        revisada: true,
      })
      const anterior = await aviso(gestor.id, ajeno.id, {
        tipoNotificacion: 'REASIGNACION_SINIESTRO',
      })
      const secreto = await aviso(otro.id, propio.id)
      await aviso(gestor.id, ajeno.id)
      await aviso(gestor.id, propio.id, { eliminado: true, fechaBaja: new Date() })
      await aviso(gestor.id, eliminando.id)
      const servicio = crearServicioNotificaciones({
        transaccion: (trabajo) => db.$transaction(trabajo, { isolationLevel: 'RepeatableRead' }),
      })
      const actores = { gestor, otro, admin, superadmin }
      const app = express()
      app.use(express.json(), cookieParser())
      app.use(
        '/api/notificaciones',
        crearNotificacionesRouter({
          servicio,
          requerirSesion: crearRequerirSesion({
            duracionMs: 1000,
            validar: async (token) =>
              actores[token] ? { usuario: actores[token], renovada: false } : null,
          }),
        }),
      )
      app.use(errorHandler)
      server = app.listen(0, '127.0.0.1')
      await once(server, 'listening')
      const pedir = (actor, ruta = '', body) =>
        fetch(`http://127.0.0.1:${server.address().port}/api/notificaciones${ruta}`, {
          method: body === undefined ? 'GET' : 'PATCH',
          headers: {
            ...(actor ? { cookie: `cova_sesion=${actor}` } : {}),
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      const listar = async (actor, query = '') => {
        const r = await pedir(actor, query)
        assert.equal(r.status, 200, await r.clone().text())
        return bandejaNotificacionesSchema.parse(await r.json())
      }
      await t.test(
        'sesión y parámetros estrictos; no acepta otro destinatario ni estados inventados',
        async () => {
          assert.equal((await pedir(null)).status, 401)
          for (const query of [
            '?idUsuario=2',
            '?tipo=INVENTADO',
            '?revision=no',
            '?pagina=0',
            '?lectura=false',
          ])
            assert.equal((await pedir('gestor', query)).status, 400)
          assert.equal(
            (await pedir('gestor', `/${a.id}/revision`, { revisada: 'true' })).status,
            400,
          )
          assert.equal(
            (await pedir('gestor', '/lecturas', { todas: true, idUsuario: otro.id })).status,
            400,
          )
          assert.equal(
            (await pedir('gestor', `/${a.id}/lectura`, { leida: true, revisada: true })).status,
            400,
          )
        },
      )
      await t.test('listado privado y filtros combinados; GET no cambia estados', async () => {
        const todos = await listar('gestor')
        assert.equal(todos.total, 3)
        assert.equal(todos.sinLeer, 2)
        assert.equal(todos.sinRevisar, 2)
        assert.ok(todos.items.every((n) => [a.id, b.id, anterior.id].includes(n.id)))
        assert.equal(todos.items.find((n) => n.id === anterior.id).puedeAbrirSiniestro, false)
        assert.ok(todos.items.find((n) => n.id === anterior.id).motivoSinAcceso)
        assert.equal(todos.items.find((n) => n.id === a.id).siniestro.id, propio.id)
        const filtrado = await listar(
          'gestor',
          '?tipo=DOCUMENTO_NUEVO&revision=revisadas&lectura=leidas',
        )
        assert.deepEqual(
          filtrado.items.map((n) => n.id),
          [b.id],
        )
        assert.equal(filtrado.totalGeneral, 3)
        assert.equal((await listar('gestor', '?tipo=DOCUMENTO_NUEVO&revision=pendientes')).total, 0)
        assert.equal(
          (await db.notificacion.findUniqueOrThrow({ where: { id: a.id } })).leida,
          false,
        )
      })
      await t.test(
        'leer no revisa; revisar implica lectura y permite volver a pendiente',
        async () => {
          assert.equal((await pedir('gestor', `/${a.id}/lectura`, {})).status, 204)
          let fila = await db.notificacion.findUniqueOrThrow({ where: { id: a.id } })
          assert.equal(fila.leida, true)
          assert.equal(fila.revisada, false)
          await pedir('gestor', `/${a.id}/lectura`, { leida: false })
          await pedir('gestor', `/${a.id}/revision`, { revisada: true })
          fila = await db.notificacion.findUniqueOrThrow({ where: { id: a.id } })
          assert.equal(fila.leida, true)
          assert.equal(fila.revisada, true)
          await pedir('gestor', `/${a.id}/revision`, { revisada: false })
          fila = await db.notificacion.findUniqueOrThrow({ where: { id: a.id } })
          assert.equal(fila.leida, true)
          assert.equal(fila.revisada, false)
        },
      )
      await t.test(
        'no marca avisos ajenos; el lote solo modifica IDs propios visibles',
        async () => {
          for (const [ruta, body] of [
            [`/${secreto.id}/lectura`, { leida: true }],
            [`/${secreto.id}/revision`, { revisada: true }],
          ])
            assert.equal((await pedir('gestor', ruta, body)).status, 404)
          await pedir('gestor', `/${a.id}/lectura`, { leida: false })
          assert.equal(
            (await pedir('gestor', '/lecturas', { ids: [a.id, secreto.id] })).status,
            204,
          )
          assert.equal(
            (await db.notificacion.findUniqueOrThrow({ where: { id: a.id } })).leida,
            true,
          )
          assert.equal(
            (await db.notificacion.findUniqueOrThrow({ where: { id: anterior.id } })).leida,
            false,
          )
          assert.equal(
            (await db.notificacion.findUniqueOrThrow({ where: { id: secreto.id } })).leida,
            false,
          )
          await pedir('gestor', '/lecturas', { todas: true })
          assert.equal((await listar('gestor')).sinLeer, 0)
          assert.equal(
            (await db.notificacion.findUniqueOrThrow({ where: { id: secreto.id } })).leida,
            false,
          )
        },
      )
      await t.test(
        'rol de base vigente y usuario activo; una sesión vieja no amplía acceso',
        async () => {
          const fuera = await aviso(admin.id, ajeno.id)
          assert.equal(
            (await listar('admin')).items.find((n) => n.id === fuera.id).puedeAbrirSiniestro,
            true,
          )
          await db.usuario.update({ where: { id: admin.id }, data: { tipoUsuario: 'GESTOR' } })
          assert.equal((await listar('admin')).total, 0)
          assert.equal(
            (await pedir('admin', `/${fuera.id}/revision`, { revisada: true })).status,
            404,
          )
          await db.usuario.update({
            where: { id: admin.id },
            data: { tipoUsuario: 'ADMINISTRADOR' },
          })
          await db.usuario.update({
            where: { id: superadmin.id },
            data: { eliminado: true, fechaBaja: new Date() },
          })
          assert.equal((await pedir('superadmin')).status, 401)
        },
      )
      await t.test(
        'paginación estable, sin duplicados; filtros persisten en todas las páginas',
        async () => {
          for (let i = 0; i < 23; i++)
            await aviso(gestor.id, propio.id, {
              tipoNotificacion: 'NOVEDAD_CARGADA',
              fechaCreacion: new Date('2026-11-11T12:00:00Z'),
            })
          const p1 = await listar('gestor', '?tipo=NOVEDAD_CARGADA&revision=pendientes'),
            p2 = await listar('gestor', '?tipo=NOVEDAD_CARGADA&revision=pendientes&pagina=99')
          assert.equal(p1.items.length, 20)
          assert.equal(p2.items.length, 3)
          assert.equal(p2.pagina, 2)
          assert.equal(new Set([...p1.items, ...p2.items].map((n) => n.id)).size, 23)
          assert.ok(
            [...p1.items, ...p2.items].every((n) => n.tipo === 'NOVEDAD_CARGADA' && !n.revisada),
          )
          assert.deepEqual(consultaNotificacionesSchema.parse({ pagina: '2' }), {
            pagina: 2,
            lectura: 'todas',
            revision: 'todas',
          })
        },
      )
    } finally {
      if (server) {
        server.closeAllConnections()
        await new Promise((resolve) => server.close(resolve))
      }
      await disconnectPrisma()
      process.env.DATABASE_URL = original
      if (creada) await control.query(`DROP DATABASE "${nombre}" WITH (FORCE)`)
      await control.end()
    }
  },
)
