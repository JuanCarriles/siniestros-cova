import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import express from 'express'
import cookieParser from 'cookie-parser'
import { io as conectarCliente } from 'socket.io-client'
import { enviarMensajeChatSchema } from '@cova/shared/schemas/chat'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearRequerirSesion } from '../src/middlewares/autenticar.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { crearServicioSesiones } from '../src/modules/auth/sesiones.service.ts'
import { crearChatRouter } from '../src/modules/chat/chat.routes.ts'
import { crearServicioChat } from '../src/modules/chat/chat.service.ts'
import { crearTiempoReal } from '../src/modules/chat/tiempo-real.ts'
import { conBaseTemporal } from './fixtures/base-temporal.mjs'

// E7-02: enviar y recibir mensajes del chat por HTTP real, con Socket.IO real y una base temporal.

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms))

test('esquema del mensaje: el mismo en el formulario y en el servidor', () => {
  const clave = randomUUID()
  assert.equal(
    enviarMensajeChatSchema.safeParse({ texto: '   ', claveEnvio: clave }).success,
    false,
  )
  assert.equal(
    enviarMensajeChatSchema.safeParse({ texto: 'x'.repeat(2001), claveEnvio: clave }).success,
    false,
  )
  assert.equal(enviarMensajeChatSchema.safeParse({ texto: 'Hola' }).success, false)
  assert.equal(
    enviarMensajeChatSchema.safeParse({ texto: 'Hola', claveEnvio: clave, idUsuario: 1 }).success,
    false,
    'el autor no viene del navegador',
  )
  assert.equal(
    enviarMensajeChatSchema.parse({ texto: '  Hola\nchau  ', claveEnvio: clave }).texto,
    'Hola\nchau',
  )
})

test(
  'E7-02: chat grupal persistido, en tiempo real, con avisos y sin edición',
  { timeout: 120_000 },
  () =>
    conBaseTemporal('chat_mensajes', async () => {
      const prisma = getPrisma()
      const clientes = []
      let servidor
      let tiempoReal
      try {
        const sesiones = crearServicioSesiones({ prisma, duracionMs: 7 * 3_600_000 })
        const usuario = (nombres, tipoUsuario, extra = {}) =>
          prisma.usuario.create({
            data: {
              nombres,
              apellidos: 'Prueba',
              tipoUsuario,
              email: `${nombres.toLowerCase()}@example.invalid`,
              documento: '0',
              telefono: '0',
              contrasena: '-',
              direccion: { create: {} },
              ...extra,
            },
          })
        const admin = await usuario('Admin', 'ADMINISTRADOR')
        const superadmin = await usuario('Super', 'SUPER_ADMINISTRADOR')
        const gestor = await usuario('Gestor', 'GESTOR')
        const otroGestor = await usuario('Otro', 'GESTOR')
        await usuario('Retirado', 'ADMINISTRADOR', { eliminado: true, fechaBaja: new Date() })
        const abierto = await prisma.estadoSiniestro.create({
          data: { nombre: 'En tratamiento', descripcion: '-' },
        })
        const cierre = await prisma.estadoSiniestro.create({
          data: { nombre: 'Cierre enviado', descripcion: '-', esCierre: true },
        })
        const aseguradora = await prisma.aseguradora.create({ data: { nombre: 'Prueba' } })
        let numero = 0
        const caso = (extra = {}) =>
          prisma.siniestro.create({
            data: {
              numeroSiniestro: `CHAT-${++numero}`,
              numeroPoliza: 'POL',
              idEstadoSiniestro: abierto.id,
              idAseguradora: aseguradora.id,
              idUsuario: gestor.id,
              fechaAsignacion: new Date('2026-10-01T12:00:00Z'),
              fechaUltimoMovimiento: new Date('2026-10-01T12:00:00Z'),
              menorEdadInvolucrado: false,
              ...extra,
            },
          })
        const siniestro = await caso()
        const cerrado = await caso({ idEstadoSiniestro: cierre.id })
        const deBaja = await caso({ eliminado: true, fechaBaja: new Date() })
        const ajeno = await caso({ idUsuario: otroGestor.id })

        // --- Servidor como en producción: API y Socket.IO en el mismo puerto
        servidor = createServer()
        tiempoReal = crearTiempoReal(servidor, { sesiones, base: () => prisma })
        const chat = crearServicioChat({
          transaccion: (trabajo) => prisma.$transaction(trabajo, { timeout: 15_000 }),
          presentes: (id) => tiempoReal.presentes(id),
          repartir: (m) => tiempoReal.emitirASala(m.idSiniestro, 'chat:mensaje', m),
        })
        const app = express()
        app.use(express.json(), cookieParser())
        app.use(
          '/api/siniestros/:id/chat',
          crearChatRouter({ requerirSesion: crearRequerirSesion(sesiones), chat }),
        )
        app.use(errorHandler)
        servidor.on('request', app)
        servidor.listen(0, '127.0.0.1')
        await once(servidor, 'listening')
        const base = `http://127.0.0.1:${servidor.address().port}`

        const tokens = {
          admin: await sesiones.crear(admin.id),
          superadmin: await sesiones.crear(superadmin.id),
          gestor: await sesiones.crear(gestor.id),
          otroGestor: await sesiones.crear(otroGestor.id),
        }
        const pedir = (quien, id, { method = 'GET', body, query = '' } = {}) =>
          fetch(`${base}/api/siniestros/${id}/chat${query}`, {
            method,
            headers: {
              cookie: `cova_sesion=${tokens[quien]}`,
              ...(body ? { 'content-type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
          })
        const enviar = async (quien, id, texto, claveEnvio = randomUUID()) => {
          const r = await pedir(quien, id, { method: 'POST', body: { texto, claveEnvio } })
          return { status: r.status, cuerpo: await r.json() }
        }
        const socket = async (quien) => {
          const c = conectarCliente(base, {
            path: '/socket.io',
            transports: ['websocket'],
            extraHeaders: { cookie: `cova_sesion=${tokens[quien]}` },
          })
          clientes.push(c)
          await once(c, 'connect')
          return c
        }
        const recibidos = (c) => {
          const lista = []
          c.on('chat:mensaje', (m) => lista.push(m))
          return lista
        }
        const avisos = (idUsuario, idSiniestro) =>
          prisma.notificacion.findMany({
            where: { idUsuario, idSiniestro, tipoNotificacion: 'MENSAJE_NUEVO' },
          })

        // --- El administrador tiene la conversación abierta; el gestor y el superadmin, no
        const adminC = await socket('admin')
        const enVivoAdmin = recibidos(adminC)
        assert.deepEqual(await adminC.emitWithAck('sala:unirse', siniestro.id), { ok: true })
        const otroC = await socket('otroGestor')
        const enVivoOtro = recibidos(otroC)

        // El gestor escribe: 201, guardado con su autor, llega en tiempo real a la sala
        const primero = await enviar(
          'gestor',
          siniestro.id,
          '  Hablé con el asegurado.\nMañana manda fotos.  ',
        )
        assert.equal(primero.status, 201)
        assert.equal(primero.cuerpo.texto, 'Hablé con el asegurado.\nMañana manda fotos.')
        assert.deepEqual(primero.cuerpo.autor, {
          id: gestor.id,
          nombre: 'Gestor Prueba',
          tipoUsuario: 'GESTOR',
        })
        await esperar(100)
        assert.deepEqual(
          enVivoAdmin.map((m) => m.id),
          [primero.cuerpo.id],
        )
        assert.deepEqual(enVivoAdmin[0], primero.cuerpo, 'llega lo mismo que quedó guardado')
        assert.equal(enVivoOtro.length, 0, 'un gestor de otro caso no recibe nada')

        // Persistido en la base, con historial; no es movimiento del caso (E5-10)
        const fila = await prisma.mensajeChat.findUniqueOrThrow({
          where: { id: primero.cuerpo.id },
        })
        assert.equal(fila.autor, 'Gestor Prueba')
        assert.equal(fila.tipoUsuarioAutor, 'GESTOR')
        const historial = await prisma.historialSiniestro.findMany({
          where: { idSiniestro: siniestro.id },
        })
        assert.deepEqual(
          historial.map((h) => h.tipoEvento),
          ['MENSAJE'],
        )
        assert.match(historial[0].descripcion, /^Gestor Prueba envió un mensaje en el chat/)
        assert.equal(
          (
            await prisma.siniestro.findUniqueOrThrow({ where: { id: siniestro.id } })
          ).fechaUltimoMovimiento.toISOString(),
          '2026-10-01T12:00:00.000Z',
        )

        // Avisos: el superadmin (no está en la conversación) sí; el admin que la está mirando, no; el autor, no
        assert.equal((await avisos(superadmin.id, siniestro.id)).length, 1)
        assert.equal((await avisos(admin.id, siniestro.id)).length, 0)
        assert.equal((await avisos(gestor.id, siniestro.id)).length, 0)
        const avisoSuper = (await avisos(superadmin.id, siniestro.id))[0]
        assert.ok(!avisoSuper.mensaje.includes('asegurado'), 'el aviso no repite el contenido')

        // El admin deja la pestaña en segundo plano: ahora sí recibe el aviso (y sigue recibiendo el mensaje)
        adminC.emit('sala:atencion', siniestro.id, false)
        await esperar(50)
        const segundo = await enviar('gestor', siniestro.id, 'Ya llegaron las fotos.')
        assert.equal(segundo.status, 201)
        await esperar(100)
        assert.equal(enVivoAdmin.length, 2)
        assert.equal((await avisos(admin.id, siniestro.id)).length, 1)
        // 1.h.1.1: el superadmin seguía con su aviso sin leer: se actualiza, no se agrega otro
        const agrupado = await avisos(superadmin.id, siniestro.id)
        assert.equal(agrupado.length, 1)
        assert.ok(agrupado[0].fechaCreacion >= avisoSuper.fechaCreacion)
        adminC.emit('sala:atencion', siniestro.id, true)

        // La administración contesta: al gestor le llega el aviso
        const respuesta = await enviar('superadmin', siniestro.id, 'Perfecto, gracias.')
        assert.equal(respuesta.status, 201)
        assert.equal(respuesta.cuerpo.autor.tipoUsuario, 'SUPER_ADMINISTRADOR')
        assert.equal((await avisos(gestor.id, siniestro.id)).length, 1)

        // --- Orden cronológico con autor, fecha y hora; y "lo posterior a" para recuperar después de un corte
        const conversacion = await (await pedir('gestor', siniestro.id)).json()
        assert.equal(conversacion.soloLectura, null)
        assert.deepEqual(
          conversacion.mensajes.map((m) => [m.autor.nombre, m.texto]),
          [
            ['Gestor Prueba', 'Hablé con el asegurado.\nMañana manda fotos.'],
            ['Gestor Prueba', 'Ya llegaron las fotos.'],
            ['Super Prueba', 'Perfecto, gracias.'],
          ],
        )
        assert.ok(conversacion.mensajes.every((m) => !Number.isNaN(Date.parse(m.fechaEnvio))))
        const posteriores = await (
          await pedir('admin', siniestro.id, { query: `?despues=${primero.cuerpo.id}` })
        ).json()
        assert.deepEqual(
          posteriores.mensajes.map((m) => m.id),
          [segundo.cuerpo.id, respuesta.cuerpo.id],
        )
        assert.equal((await pedir('admin', siniestro.id, { query: '?despues=x' })).status, 400)

        // --- El mismo envío reintentado: un solo mensaje, un solo historial
        const clave = randomUUID()
        const a = await enviar('gestor', siniestro.id, 'Reintento', clave)
        const b = await enviar('gestor', siniestro.id, 'Reintento', clave)
        assert.equal(b.status, 201)
        assert.equal(b.cuerpo.id, a.cuerpo.id)
        assert.equal(await prisma.mensajeChat.count({ where: { claveEnvio: clave } }), 1)
        assert.equal(
          await prisma.historialSiniestro.count({ where: { idSiniestro: siniestro.id } }),
          4,
        )
        // Una clave ya usada no sirve para otro usuario ni otro caso
        assert.equal((await enviar('admin', siniestro.id, 'Reintento', clave)).status, 409)

        // El nombre y el rol quedan como eran al enviar
        await prisma.usuario.update({ where: { id: gestor.id }, data: { nombres: 'Renombrado' } })
        const despues = await (await pedir('admin', siniestro.id)).json()
        assert.equal(despues.mensajes[0].autor.nombre, 'Gestor Prueba')
        await prisma.usuario.update({ where: { id: gestor.id }, data: { nombres: 'Gestor' } })

        // --- Permisos: el gestor, solo sus casos; la administración, todos
        assert.equal((await enviar('otroGestor', siniestro.id, 'No es mío')).status, 403)
        assert.equal((await pedir('otroGestor', siniestro.id)).status, 403)
        assert.equal((await enviar('gestor', ajeno.id, 'Tampoco')).status, 403)
        assert.equal((await enviar('admin', ajeno.id, 'Admin en cualquier caso')).status, 201)
        assert.equal((await enviar('gestor', 2147483647, 'No existe')).status, 404)
        const sinSesion = await fetch(`${base}/api/siniestros/${siniestro.id}/chat`)
        assert.equal(sinSesion.status, 401)

        // Cerrado o dado de baja: se lee, no se escribe
        const cerradoGet = await (await pedir('gestor', cerrado.id)).json()
        assert.match(cerradoGet.soloLectura, /cerrado/)
        const cerradoPost = await enviar('admin', cerrado.id, 'Tarde')
        assert.equal(cerradoPost.status, 409)
        assert.match(cerradoPost.cuerpo.error, /cerrado/)
        const bajaGet = await (await pedir('admin', deBaja.id)).json()
        assert.match(bajaGet.soloLectura, /dado de baja/)
        assert.equal((await enviar('admin', deBaja.id, 'De baja')).status, 409)
        assert.equal(
          await prisma.mensajeChat.count({
            where: { idSiniestro: { in: [cerrado.id, deBaja.id] } },
          }),
          0,
        )

        // --- Los mensajes no se editan ni se borran: no hay rutas
        const idMensaje = primero.cuerpo.id
        for (const method of ['PUT', 'PATCH', 'DELETE']) {
          const r = await fetch(`${base}/api/siniestros/${siniestro.id}/chat/${idMensaje}`, {
            method,
            headers: { cookie: `cova_sesion=${tokens.admin}` },
          })
          assert.equal(r.status, 404, `${method} no existe`)
        }
        assert.deepEqual(Object.keys(chat).sort(), ['enviar', 'leer', 'listar'])
        assert.equal(
          (await prisma.mensajeChat.findUniqueOrThrow({ where: { id: idMensaje } }))
            .contenidoMensaje,
          'Hablé con el asegurado.\nMañana manda fotos.',
        )
      } finally {
        for (const c of clientes) c.disconnect()
        tiempoReal?.cerrar()
        if (servidor) await new Promise((ok) => servidor.close(() => ok()))
        await disconnectPrisma()
      }
    }),
)
