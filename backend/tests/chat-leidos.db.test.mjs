import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import express from 'express'
import cookieParser from 'cookie-parser'
import { io as conectarCliente } from 'socket.io-client'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearRequerirSesion } from '../src/middlewares/autenticar.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { crearServicioSesiones } from '../src/modules/auth/sesiones.service.ts'
import { crearChatRouter } from '../src/modules/chat/chat.routes.ts'
import { crearServicioChat } from '../src/modules/chat/chat.service.ts'
import { crearServicioSiniestros } from '../src/modules/siniestros/siniestros.service.ts'
import { crearTiempoReal } from '../src/modules/chat/tiempo-real.ts'
import { conBaseTemporal } from './fixtures/base-temporal.mjs'

// E7-03 (RF-26, CU-10 1.h.3): marca de leído con usuario y hora, al entrar a la conversación, informada en tiempo
// real a los demás participantes, y retiro del aviso de mensajes nuevos de la bandeja.

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms))

test('E7-03: indicador de mensaje leído', { timeout: 120_000 }, () =>
  conBaseTemporal('chat_leidos', async () => {
    const prisma = getPrisma()
    const clientes = []
    let servidor
    let tiempoReal
    try {
      const sesiones = crearServicioSesiones({ prisma, duracionMs: 7 * 3_600_000 })
      const usuario = (nombres, tipoUsuario) =>
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
          },
        })
      const admin = await usuario('Admin', 'ADMINISTRADOR')
      const superadmin = await usuario('Super', 'SUPER_ADMINISTRADOR')
      const gestor = await usuario('Gestor', 'GESTOR')
      const otroGestor = await usuario('Otro', 'GESTOR')
      const abierto = await prisma.estadoSiniestro.create({
        data: { nombre: 'En tratamiento', descripcion: '-' },
      })
      const cierre = await prisma.estadoSiniestro.create({
        data: { nombre: 'Cierre enviado', descripcion: '-', esCierre: true },
      })
      const aseguradora = await prisma.aseguradora.create({ data: { nombre: 'Prueba' } })
      const siniestro = await prisma.siniestro.create({
        data: {
          numeroSiniestro: 'LEIDOS-1',
          numeroPoliza: 'POL',
          idEstadoSiniestro: abierto.id,
          idAseguradora: aseguradora.id,
          idUsuario: gestor.id,
          fechaAsignacion: new Date(),
          menorEdadInvolucrado: false,
        },
      })

      let ahora = new Date('2026-11-10T13:00:00.000Z')
      // Para simular dos pestañas que leen en momentos distintos: cada llamada al reloj avanza un minuto
      let relojAvanza = false
      let minutos = 0
      const reloj = () => (relojAvanza ? new Date(ahora.getTime() + 60_000 * minutos++) : ahora)
      // Para meter algo justo antes de que la lectura retire el aviso (una sola vez)
      let antesDeRetirarAviso = null
      const conPausa = (tx) =>
        new Proxy(tx, {
          get(t, k) {
            if (k === 'notificacion')
              return new Proxy(t.notificacion, {
                get(d, m) {
                  if (m !== 'updateMany' || !antesDeRetirarAviso) return d[m]
                  const pausa = antesDeRetirarAviso
                  antesDeRetirarAviso = null
                  return async (args) => {
                    await pausa()
                    return d.updateMany(args)
                  }
                },
              })
            const v = t[k]
            return typeof v === 'function' ? v.bind(t) : v
          },
        })
      servidor = createServer()
      tiempoReal = crearTiempoReal(servidor, { sesiones, base: () => prisma })
      const chat = crearServicioChat({
        transaccion: (trabajo) =>
          prisma.$transaction((tx) => trabajo(conPausa(tx)), { timeout: 15_000 }),
        presentes: (id) => tiempoReal.presentes(id),
        repartir: (m) => tiempoReal.emitirASala(m.idSiniestro, 'chat:mensaje', m),
        repartirLecturas: (l) => tiempoReal.emitirASala(l.idSiniestro, 'chat:leido', l),
        reloj,
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
      const pedir = async (quien, ruta = '', method = 'GET', body) => {
        const r = await fetch(`${base}/api/siniestros/${siniestro.id}/chat${ruta}`, {
          method,
          headers: {
            cookie: `cova_sesion=${tokens[quien]}`,
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        })
        return { status: r.status, cuerpo: await r.json() }
      }
      const enviar = async (quien, texto) =>
        (await pedir(quien, '', 'POST', { texto, claveEnvio: randomUUID() })).cuerpo
      const leer = (quien) => pedir(quien, '/leidos', 'POST')
      const avisoVisible = (idUsuario) =>
        prisma.notificacion.count({
          where: {
            idUsuario,
            idSiniestro: siniestro.id,
            tipoNotificacion: 'MENSAJE_NUEVO',
            eliminado: false,
          },
        })

      // El gestor mira la conversación: recibe en vivo las lecturas de los demás
      const gestorC = conectarCliente(base, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: { cookie: `cova_sesion=${tokens.gestor}` },
      })
      clientes.push(gestorC)
      await once(gestorC, 'connect')
      assert.deepEqual(await gestorC.emitWithAck('sala:unirse', siniestro.id), { ok: true })
      // Estar en la sala (la barra de pestañas, por el número de no leídos) no es mirar la conversación
      assert.deepEqual([...tiempoReal.presentes(siniestro.id)], [])
      gestorC.emit('sala:atencion', siniestro.id, true)
      await esperar(50)
      assert.deepEqual([...tiempoReal.presentes(siniestro.id)], [gestor.id])
      const lecturasEnVivo = []
      gestorC.on('chat:leido', (l) => lecturasEnVivo.push(l))

      const m1 = await enviar('gestor', 'Primero')
      const m2 = await enviar('gestor', 'Segundo')
      assert.deepEqual(m1.leidoPor, [], 'recién enviado, nadie lo leyó')
      // El número de la pestaña: los de otros sin leer, para cada uno
      const sinLeer = async (quien) => (await pedir(quien, '/sin-leer')).cuerpo.sinLeer
      assert.equal(await sinLeer('admin'), 2)
      assert.equal(await sinLeer('gestor'), 0, 'los propios no cuentan')
      assert.equal(await avisoVisible(admin.id), 1)

      // --- El administrador entra a la conversación: se marca con su usuario y la hora del servidor
      ahora = new Date('2026-11-10T13:20:00.000Z')
      const lectura = await leer('admin')
      assert.equal(lectura.status, 200)
      assert.equal(lectura.cuerpo.leidos, 2)
      assert.equal(lectura.cuerpo.avisosRetirados, 1)
      assert.deepEqual(lectura.cuerpo.lecturas, {
        idSiniestro: siniestro.id,
        idsMensajes: [m1.id, m2.id],
        lector: { id: admin.id, nombre: 'Admin Prueba', tipoUsuario: 'ADMINISTRADOR' },
        fechaLeido: '2026-11-10T13:20:00.000Z',
      })
      const filas = await prisma.lecturaMensajeChat.findMany({
        where: { idUsuario: admin.id },
        orderBy: { idMensajeChat: 'asc' },
      })
      assert.deepEqual(
        filas.map((f) => [f.idMensajeChat, f.fechaLeido.toISOString()]),
        [
          [m1.id, '2026-11-10T13:20:00.000Z'],
          [m2.id, '2026-11-10T13:20:00.000Z'],
        ],
      )
      // 1.h.3: el aviso de mensajes nuevos del siniestro se retira de la bandeja (queda como baja lógica)
      assert.equal(await avisoVisible(admin.id), 0)
      assert.equal(await avisoVisible(superadmin.id), 1, 'el de los demás sigue')
      assert.equal(await sinLeer('admin'), 0)
      assert.equal(await sinLeer('superadmin'), 2)
      // La ficha trae el mismo número, para mostrarlo en la pestaña sin esperar el tiempo real
      const ficha = (u) => crearServicioSiniestros(prisma).obtener(u, siniestro.id)
      assert.equal((await ficha(superadmin)).cantidades.chatSinLeer, 2)
      assert.equal((await ficha(admin)).cantidades.chatSinLeer, 0)

      // --- Se informa en tiempo real a los demás participantes
      await esperar(100)
      assert.equal(lecturasEnVivo.length, 1)
      assert.deepEqual(lecturasEnVivo[0], lectura.cuerpo.lecturas)

      // Volver a entrar sin nada nuevo: no marca ni avisa otra vez
      const otraVez = await leer('admin')
      assert.equal(otraVez.cuerpo.leidos, 0)
      await esperar(100)
      assert.equal(lecturasEnVivo.length, 1)

      // El superadministrador lee más tarde: cada mensaje muestra quién lo leyó y cuándo, en orden
      ahora = new Date('2026-11-10T14:05:00.000Z')
      assert.equal((await leer('superadmin')).cuerpo.leidos, 2)
      const conversacion = (await pedir('gestor')).cuerpo
      assert.deepEqual(
        conversacion.mensajes[0].leidoPor.map((l) => [l.lector.nombre, l.fechaLeido]),
        [
          ['Admin Prueba', '2026-11-10T13:20:00.000Z'],
          ['Super Prueba', '2026-11-10T14:05:00.000Z'],
        ],
      )
      assert.equal(conversacion.mensajes[1].leidoPor.length, 2)

      // --- El autor no "lee" sus propios mensajes; lo de otros sí
      assert.equal((await leer('gestor')).cuerpo.leidos, 0)
      const respuesta = await enviar('admin', 'Recibido')
      // El gestor está mirando: no recibe aviso en la bandeja, pero el mensaje queda sin leer hasta marcarlo
      assert.equal(await avisoVisible(gestor.id), 0)
      const lecturaGestor = await leer('gestor')
      assert.deepEqual(lecturaGestor.cuerpo.lecturas.idsMensajes, [respuesta.id])
      assert.equal(
        await prisma.lecturaMensajeChat.count({ where: { idUsuario: gestor.id } }),
        1,
        'solo el mensaje del administrador',
      )

      // Un aviso retirado no impide el próximo: un mensaje nuevo vuelve a avisar
      gestorC.emit('sala:atencion', siniestro.id, false)
      await esperar(50)
      await enviar('admin', 'Otro más')
      assert.equal(await avisoVisible(gestor.id), 1)
      // Dos pestañas marcando a la vez, cada una con su hora: una sola lectura por mensaje, sin error, y lo que
      // responde cada una es lo que quedó guardado (no la hora de un intento que no se guardó)
      relojAvanza = true
      const [a, b] = await Promise.all([leer('gestor'), leer('gestor')])
      relojAvanza = false
      assert.equal(a.status, 200)
      assert.equal(b.status, 200)
      assert.equal(a.cuerpo.leidos + b.cuerpo.leidos, 1)
      assert.equal(await prisma.lecturaMensajeChat.count({ where: { idUsuario: gestor.id } }), 2)
      assert.equal(await avisoVisible(gestor.id), 0)
      for (const r of [a.cuerpo, b.cuerpo]) {
        assert.equal(r.lecturas.idsMensajes.length, r.leidos)
        for (const idMensaje of r.lecturas.idsMensajes) {
          const fila = await prisma.lecturaMensajeChat.findFirstOrThrow({
            where: { idUsuario: gestor.id, idMensajeChat: idMensaje },
          })
          assert.equal(r.lecturas.fechaLeido, fila.fechaLeido.toISOString())
        }
      }

      // Un mensaje que llega mientras se marca la lectura: no se marca (no estaba entre los pendientes), así que su
      // aviso tiene que quedar. El envío espera a que termine la lectura (bloqueo del siniestro).
      await enviar('admin', 'Antes de entrar')
      let enMedio
      antesDeRetirarAviso = async () => {
        enMedio = enviar('admin', 'Llega en medio')
        await esperar(300)
      }
      const conLlegada = await leer('gestor')
      assert.equal(conLlegada.status, 200)
      await enMedio
      assert.equal(
        (await pedir('gestor', '/sin-leer')).cuerpo.sinLeer,
        1,
        'el mensaje del medio sigue sin leer',
      )
      assert.equal(await avisoVisible(gestor.id), 1, 'y conserva su aviso en la bandeja')
      await leer('gestor')

      // --- Permisos: solo los participantes; en un caso cerrado se sigue leyendo
      assert.equal((await leer('otroGestor')).status, 403)
      assert.equal((await pedir('otroGestor', '/sin-leer')).status, 403)
      await prisma.siniestro.update({
        where: { id: siniestro.id },
        data: { idEstadoSiniestro: cierre.id },
      })
      await enviar('admin', 'x').catch(() => {})
      assert.equal((await leer('admin')).status, 200)
    } finally {
      for (const c of clientes) c.disconnect()
      tiempoReal?.cerrar()
      if (servidor) await new Promise((ok) => servidor.close(() => ok()))
      await disconnectPrisma()
    }
  }),
)
