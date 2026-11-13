import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import express from 'express'
import cookieParser from 'cookie-parser'
import { io } from 'socket.io-client'
import { conBaseTemporal } from './fixtures/base-temporal.mjs'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioSesiones } from '../src/modules/auth/sesiones.service.ts'
import { crearRequerirSesion } from '../src/middlewares/autenticar.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { crearTiempoReal } from '../src/modules/chat/tiempo-real.ts'
import { crearServicioChat } from '../src/modules/chat/chat.service.ts'
import { crearChatRouter } from '../src/modules/chat/chat.routes.ts'
import { crearServicioNotificaciones } from '../src/modules/notificaciones/notificaciones.service.ts'
import { crearNotificacionesRouter } from '../src/modules/notificaciones/notificaciones.routes.ts'

async function hasta(condicion) {
  const inicio = Date.now()
  while (!condicion()) {
    assert.ok(Date.now() - inicio < 5000, 'No llegó el estado del socket')
    await new Promise((r) => setTimeout(r, 10))
  }
}

test(
  'E8-03: agrupado de avisos del chat por usuario y conversación',
  { timeout: 120000 },
  async (t) =>
    conBaseTemporal('chat_agrupado', async () => {
      const db = getPrisma(),
        clientes = []
      let servidor, rt
      try {
        const usuario = (nombres, tipoUsuario, eliminado = false) =>
          db.usuario.create({
            data: {
              nombres,
              apellidos: 'Prueba',
              tipoUsuario,
              eliminado,
              fechaBaja: eliminado ? new Date() : null,
              email: nombres + '@example.invalid',
              documento: '0',
              telefono: '0',
              contrasena: '-',
              direccion: { create: {} },
            },
          })
        const gestor = await usuario('Gestor', 'GESTOR'),
          admin = await usuario('Admin', 'ADMINISTRADOR'),
          superadmin = await usuario('Super', 'SUPER_ADMINISTRADOR'),
          otro = await usuario('Otro', 'GESTOR'),
          inactivo = await usuario('Inactivo', 'ADMINISTRADOR', true)
        const estado = await db.estadoSiniestro.create({
          data: { nombre: 'En tratamiento', descripcion: 'Activo' },
        })
        const aseguradora = await db.aseguradora.create({ data: { nombre: 'Prueba' } })
        let numero = 0,
          tick = 0
        const caso = () =>
          db.siniestro.create({
            data: {
              numeroSiniestro: 'AGR-' + ++numero,
              numeroPoliza: 'P',
              idEstadoSiniestro: estado.id,
              idAseguradora: aseguradora.id,
              idUsuario: gestor.id,
              fechaAsignacion: new Date(),
              menorEdadInvolucrado: false,
            },
          })
        const a = await caso(),
          b = await caso()
        const base = {
          transaccion: (trabajo, opciones) =>
            db.$transaction(trabajo, { timeout: 15000, ...opciones }),
        }
        const sesiones = crearServicioSesiones({ prisma: db, duracionMs: 3600000 })
        const tokens = {
          gestor: await sesiones.crear(gestor.id),
          admin: await sesiones.crear(admin.id),
          superadmin: await sesiones.crear(superadmin.id),
          otro: await sesiones.crear(otro.id),
        }
        servidor = createServer()
        rt = crearTiempoReal(servidor, { sesiones, base: () => db })
        const deps = {
          ...base,
          presentes: (id) => rt.presentes(id),
          repartir: (m) => rt.emitirASala(m.idSiniestro, 'chat:mensaje', m),
          repartirLecturas: (l) => rt.emitirASala(l.idSiniestro, 'chat:leido', l),
          reloj: () => new Date(Date.parse('2026-11-11T15:00:00Z') + tick++ * 1000),
        }
        const chat = crearServicioChat(deps),
          notificaciones = crearServicioNotificaciones(base)
        const app = express().use(express.json(), cookieParser())
        const requerirSesion = crearRequerirSesion(sesiones)
        app.use('/api/siniestros/:id/chat', crearChatRouter({ requerirSesion, chat }))
        app.use(
          '/api/notificaciones',
          crearNotificacionesRouter({ requerirSesion, servicio: notificaciones }),
        )
        app.use(errorHandler)
        servidor.on('request', app).listen(0, '127.0.0.1')
        await once(servidor, 'listening')
        const url = `http://127.0.0.1:${servidor.address().port}`
        const fetchReal = globalThis.fetch
        t.mock.method(globalThis, 'fetch', (destino, opciones) => {
          assert.ok(String(destino).startsWith(url + '/api/'), 'Solo API local, ningún correo real')
          return fetchReal(destino, opciones)
        })
        const pedir = (quien, ruta, method = 'GET', body) =>
          fetch(url + '/api' + ruta, {
            method,
            headers: {
              cookie: `cova_sesion=${tokens[quien]}`,
              ...(body ? { 'content-type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
          })
        const enviar = async (
          quien,
          id,
          texto = 'Mensaje privado de prueba',
          claveEnvio = randomUUID(),
        ) => {
          const r = await pedir(quien, `/siniestros/${id}/chat`, 'POST', { texto, claveEnvio })
          assert.equal(r.status, 201, await r.clone().text())
          return r.json()
        }
        const leer = async (quien, id) => {
          const r = await pedir(quien, `/siniestros/${id}/chat/leidos`, 'POST')
          assert.equal(r.status, 200, await r.clone().text())
          return r.json()
        }
        const visibles = (idUsuario, idSiniestro, extra = {}) =>
          db.notificacion.findMany({
            where: {
              idUsuario,
              idSiniestro,
              tipoNotificacion: 'MENSAJE_NUEVO',
              eliminado: false,
              ...extra,
            },
            orderBy: { id: 'asc' },
          })
        let primero, clave, primerMensaje

        await t.test(
          'veinte mensajes simultáneos: un mismo aviso con contador 20 y fecha del último',
          async () => {
            clave = randomUUID()
            primerMensaje = await enviar('gestor', a.id, 'Primero', clave)
            primero = (await visibles(admin.id, a.id))[0]
            assert.match(primero.mensaje, /Tenés 1 mensaje sin leer/)
            const mensajes = await Promise.all(
              Array.from({ length: 19 }, () => enviar('gestor', a.id)),
            )
            const avisos = await visibles(admin.id, a.id)
            assert.equal(avisos.length, 1)
            assert.equal(avisos[0].id, primero.id)
            assert.match(avisos[0].mensaje, /Tenés 20 mensajes sin leer/)
            assert.equal(
              avisos[0].fechaCreacion.toISOString(),
              mensajes
                .map((m) => m.fechaEnvio)
                .sort()
                .at(-1),
            )
            assert.ok(!avisos[0].mensaje.includes('privado'))
            assert.equal(
              (await notificaciones.resumen(admin)).sinLeer,
              1,
              'la campana cuenta avisos, no veinte mensajes',
            )
            assert.equal((await visibles(gestor.id, a.id)).length, 0, 'sin aviso propio')
            assert.equal((await visibles(otro.id, a.id)).length, 0, 'sin destinatarios ajenos')
            assert.equal(
              (await visibles(inactivo.id, a.id)).length,
              0,
              'sin destinatarios inactivos',
            )
          },
        )
        await t.test('reintento del mismo envío no modifica el contador ni la fecha', async () => {
          const antes = (await visibles(admin.id, a.id))[0]
          assert.equal((await enviar('gestor', a.id, 'Primero', clave)).id, primerMensaje.id)
          const despues = (await visibles(admin.id, a.id))[0]
          assert.equal(despues.mensaje, antes.mensaje)
          assert.equal(despues.fechaCreacion.toISOString(), antes.fechaCreacion.toISOString())
          assert.equal(await db.mensajeChat.count({ where: { idSiniestro: a.id } }), 20)
        })
        await t.test(
          'contador independiente por usuario y siniestro; no cuenta los mensajes propios',
          async () => {
            await enviar('admin', a.id)
            assert.match((await visibles(gestor.id, a.id))[0].mensaje, /Tenés 1 mensaje sin leer/)
            assert.match(
              (await visibles(superadmin.id, a.id))[0].mensaje,
              /Tenés 21 mensajes sin leer/,
            )
            assert.match((await visibles(admin.id, a.id))[0].mensaje, /Tenés 20 mensajes sin leer/)
            await enviar('gestor', b.id)
            assert.match((await visibles(admin.id, b.id))[0].mensaje, /Tenés 1 mensaje sin leer/)
            assert.equal((await notificaciones.resumen(admin)).sinLeer, 2)
          },
        )
        await t.test(
          'leer la campana cierra el grupo; entrar al chat retira solo los avisos de esa conversación',
          async () => {
            const r = await pedir('admin', `/notificaciones/${primero.id}/lectura`, 'PATCH', {
              leida: true,
            })
            assert.equal(r.status, 204)
            await enviar('gestor', a.id)
            const actual = (await visibles(admin.id, a.id, { leida: false }))[0]
            assert.notEqual(actual.id, primero.id)
            assert.match(
              actual.mensaje,
              /Tenés 21 mensajes sin leer/,
              'pendientes reales aunque antes se leyera la campana',
            )
            assert.match(
              (await db.notificacion.findUniqueOrThrow({ where: { id: primero.id } })).mensaje,
              /Tenés 20 mensajes sin leer/,
              'se conserva la descripción del aviso ya leído',
            )
            assert.equal((await leer('admin', a.id)).leidos, 21)
            assert.equal((await visibles(admin.id, a.id)).length, 0)
            assert.equal((await visibles(admin.id, b.id)).length, 1)
            assert.equal((await visibles(superadmin.id, a.id)).length, 1)
          },
        )
        await t.test(
          'dos pestañas: basta una conversación visible; al ocultar ambas se vuelve a notificar',
          async () => {
            await leer('gestor', a.id)
            const conectar = async () => {
              const c = io(url, {
                path: '/socket.io',
                transports: ['websocket'],
                extraHeaders: { cookie: `cova_sesion=${tokens.gestor}` },
              })
              clientes.push(c)
              await once(c, 'connect')
              assert.deepEqual(await c.emitWithAck('sala:unirse', a.id), { ok: true })
              return c
            }
            const c1 = await conectar(),
              c2 = await conectar()
            c1.emit('sala:atencion', a.id, true)
            c2.emit('sala:atencion', a.id, false)
            await hasta(() => rt.presentes(a.id).has(gestor.id))
            await enviar('admin', a.id)
            assert.equal((await visibles(gestor.id, a.id)).length, 0)
            await leer('gestor', a.id)
            c2.emit('sala:atencion', a.id, true)
            await hasta(() => rt.io.sockets.sockets.get(c2.id)?.data.atentas.has(a.id))
            c1.emit('sala:atencion', a.id, false)
            await hasta(() => !rt.io.sockets.sockets.get(c1.id)?.data.atentas.has(a.id))
            await enviar('admin', a.id)
            assert.equal((await visibles(gestor.id, a.id)).length, 0)
            await leer('gestor', a.id)
            c2.emit('sala:atencion', a.id, false)
            await hasta(() => !rt.presentes(a.id).has(gestor.id))
            await enviar('admin', a.id)
            assert.match((await visibles(gestor.id, a.id))[0].mensaje, /Tenés 1 mensaje sin leer/)
          },
        )
        await t.test(
          'si la campana lee durante el agrupado, no se resucita el aviso leído',
          async () => {
            const c = await caso()
            await enviar('gestor', c.id)
            const viejo = (await visibles(admin.id, c.id))[0]
            let liberar, avisar
            const pausa = new Promise((r) => {
                liberar = r
              }),
              encontrado = new Promise((r) => {
                avisar = r
              })
            let pausas = 0
            const lento = crearServicioChat({
              ...deps,
              transaccion: (trabajo) =>
                db.$transaction(
                  (tx) =>
                    trabajo(
                      new Proxy(tx, {
                        get(target, key) {
                          if (key !== 'notificacion') return Reflect.get(target, key)
                          return new Proxy(target.notificacion, {
                            get(d, m) {
                              if (m !== 'findFirst') return Reflect.get(d, m)
                              return async (args) => {
                                const resultado = await d.findFirst(args)
                                if (args.where.idUsuario === admin.id && !pausas++) {
                                  avisar()
                                  await pausa
                                }
                                return resultado
                              }
                            },
                          })
                        },
                      }),
                    ),
                  { timeout: 15000 },
                ),
            })
            const envio = lento.enviar(gestor, c.id, { texto: 'Segundo', claveEnvio: randomUUID() })
            try {
              await Promise.race([encontrado, envio])
              await notificaciones.leer(admin, viejo.id)
            } finally {
              liberar()
            }
            await envio
            assert.equal(
              (await db.notificacion.findUniqueOrThrow({ where: { id: viejo.id } })).leida,
              true,
            )
            const pendientes = await visibles(admin.id, c.id, { leida: false })
            assert.equal(pendientes.length, 1)
            assert.notEqual(pendientes[0].id, viejo.id)
            assert.match(pendientes[0].mensaje, /Tenés 2 mensajes sin leer/)
            // Marcar el aviso viejo sin leer unifica el grupo y conserva la fecha más reciente.
            const fecha = pendientes[0].fechaCreacion.toISOString()
            await notificaciones.revisar(admin, viejo.id, true)
            await notificaciones.leer(admin, viejo.id, false)
            const unidos = await visibles(admin.id, c.id, { leida: false })
            assert.equal(unidos.length, 1)
            assert.equal(unidos[0].id, viejo.id)
            assert.equal(
              unidos[0].revisada,
              true,
              'marcar sin leer conserva la revisión independiente',
            )
            assert.equal(unidos[0].fechaCreacion.toISOString(), fecha)
            assert.equal(
              (await db.notificacion.findUniqueOrThrow({ where: { id: pendientes[0].id } }))
                .eliminado,
              true,
            )
            await enviar('gestor', c.id)
            assert.equal((await visibles(admin.id, c.id, { leida: false }))[0].id, viejo.id)
            assert.match(
              (await visibles(admin.id, c.id, { leida: false }))[0].mensaje,
              /Tenés 3 mensajes sin leer/,
            )
            await assert.rejects(notificaciones.leer(otro, viejo.id, false), { status: 404 })
            await assert.rejects(
              db.notificacion.create({
                data: {
                  idUsuario: admin.id,
                  idSiniestro: c.id,
                  tipoNotificacion: 'MENSAJE_NUEVO',
                  mensaje: 'Duplicado',
                  leida: false,
                  revisada: false,
                },
              }),
              (e) => e.code === 'P2002',
            )
          },
        )
        await t.test(
          'marcar sin leer revalida el acceso después de esperar el bloqueo del caso',
          async () => {
            const c = await caso()
            await enviar('admin', c.id)
            const [aviso] = await visibles(gestor.id, c.id, { leida: false })
            assert.ok(aviso)
            await notificaciones.leer(gestor, aviso.id)
            const conexion = new pg.Client({ connectionString: process.env.DATABASE_URL })
            await conexion.connect()
            let resultado
            try {
              await conexion.query('BEGIN')
              await conexion.query('SELECT id FROM "Siniestro" WHERE id=$1 FOR NO KEY UPDATE', [
                c.id,
              ])
              resultado = notificaciones.leer(gestor, aviso.id, false).then(
                () => 'permitido',
                (error) => error.status,
              )
              let esperando = false
              for (let i = 0; i < 100 && !esperando; i++) {
                esperando = (
                  await conexion.query(
                    'SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND cardinality(pg_blocking_pids(pid))>0) AS esperando',
                  )
                ).rows[0].esperando
                if (!esperando) await new Promise((resolve) => setTimeout(resolve, 20))
              }
              assert.equal(esperando, true, 'la operación debe haber esperado el bloqueo realmente')
              await conexion.query('UPDATE "Siniestro" SET "idUsuario"=$1 WHERE id=$2', [
                otro.id,
                c.id,
              ])
              await conexion.query('COMMIT')
              assert.equal(
                await resultado,
                404,
                'una reasignación impide marcar el aviso con permisos anteriores',
              )
              const actual = await db.notificacion.findUniqueOrThrow({ where: { id: aviso.id } })
              assert.equal(actual.leida, true)
              assert.equal(actual.eliminado, false)
            } finally {
              await conexion.query('ROLLBACK')
              await resultado
              await conexion.end()
            }
          },
        )
        await t.test(
          'migración: consolida duplicados previos sin borrar mensajes ni lecturas',
          async () => {
            const sql = new pg.Client({ connectionString: process.env.DATABASE_URL })
            await sql.connect()
            try {
              await sql.query('DROP INDEX "Notificacion_chat_pendiente_unico"')
              const c = await caso()
              const guardar = (fecha, extra = {}) =>
                db.notificacion.create({
                  data: {
                    idUsuario: admin.id,
                    idSiniestro: c.id,
                    tipoNotificacion: 'MENSAJE_NUEVO',
                    mensaje: 'Anterior',
                    leida: false,
                    revisada: false,
                    fechaCreacion: fecha,
                    ...extra,
                  },
                })
              const antiguo = await guardar(new Date('2026-11-10T10:00:00Z'))
              const nuevo = await guardar(new Date('2026-11-11T10:00:00Z'))
              const leido = await guardar(new Date('2026-11-11T11:00:00Z'), { leida: true })
              const antes = [await db.mensajeChat.count(), await db.lecturaMensajeChat.count()]
              await sql.query(
                await readFile(
                  new URL(
                    '../prisma/migrations/20261111190000_aviso_chat_pendiente_unico/migration.sql',
                    import.meta.url,
                  ),
                  'utf8',
                ),
              )
              assert.deepEqual(
                (await visibles(admin.id, c.id, { leida: false })).map((n) => n.id),
                [nuevo.id],
              )
              const retirado = await db.notificacion.findUniqueOrThrow({
                where: { id: antiguo.id },
              })
              assert.equal(retirado.eliminado, true)
              assert.ok(retirado.fechaBaja)
              assert.equal(
                (await db.notificacion.findUniqueOrThrow({ where: { id: leido.id } })).eliminado,
                false,
              )
              assert.deepEqual(
                [await db.mensajeChat.count(), await db.lecturaMensajeChat.count()],
                antes,
              )
            } finally {
              await sql.end()
            }
          },
        )
      } finally {
        for (const c of clientes) c.disconnect()
        rt?.cerrar()
        if (rt) await new Promise((r) => rt.io.close(r))
        else if (servidor) await new Promise((r) => servidor.close(r))
        await disconnectPrisma()
      }
    }),
)
