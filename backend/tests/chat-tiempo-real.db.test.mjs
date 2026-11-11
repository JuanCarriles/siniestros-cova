import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import net from 'node:net'
import { once } from 'node:events'
import { io as conectarCliente } from 'socket.io-client'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioSesiones } from '../src/modules/auth/sesiones.service.ts'
import { crearTiempoReal } from '../src/modules/chat/tiempo-real.ts'
import { conBaseTemporal } from './fixtures/base-temporal.mjs'

// E7-01: Socket.IO real sobre un servidor HTTP real y una base temporal. Comprueba la conexión autenticada con la
// cookie de sesión, el control de acceso antes de unir a la sala del siniestro, la salida de quien pierde el acceso
// o la sesión, y la reconexión automática cuando se corta la red (un proxy TCP que corta y vuelve a dejar pasar).

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms))

async function hasta(condicion, mensaje, limiteMs = 5_000) {
  const inicio = Date.now()
  while (!(await condicion())) {
    if (Date.now() - inicio > limiteMs) assert.fail(`Tiempo agotado esperando: ${mensaje}`)
    await esperar(25)
  }
}

/** Proxy TCP entre el cliente y el servidor: cortar() simula que se cae la red del usuario. */
async function crearRed(puertoDestino) {
  const abiertas = new Set()
  let cortada = false
  const proxy = net.createServer((entrante) => {
    if (cortada) return entrante.destroy()
    const saliente = net.connect(puertoDestino, '127.0.0.1')
    abiertas.add(entrante).add(saliente)
    const cerrar = () => {
      entrante.destroy()
      saliente.destroy()
      abiertas.delete(entrante)
      abiertas.delete(saliente)
    }
    entrante.on('error', cerrar).on('close', cerrar)
    saliente.on('error', cerrar).on('close', cerrar)
    entrante.pipe(saliente).pipe(entrante)
  })
  proxy.listen(0, '127.0.0.1')
  await once(proxy, 'listening')
  return {
    puerto: proxy.address().port,
    cortar() {
      cortada = true
      for (const s of abiertas) s.destroy()
    },
    restablecer() {
      cortada = false
    },
    cerrar: () => new Promise((ok) => proxy.close(ok)),
  }
}

test(
  'E7-01: chat en tiempo real autenticado, con salas por siniestro y reconexión',
  { timeout: 120_000 },
  () =>
    conBaseTemporal('chat_tiempo_real', async () => {
      const prisma = getPrisma()
      const clientes = []
      let servidor
      let tiempoReal
      let red
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
        const gestor = await usuario('Gestor', 'GESTOR')
        const otroGestor = await usuario('Otro', 'GESTOR')
        const estado = await prisma.estadoSiniestro.create({
          data: { nombre: 'En tratamiento', descripcion: '-' },
        })
        const aseguradora = await prisma.aseguradora.create({ data: { nombre: 'Prueba' } })
        let numero = 0
        const caso = (idUsuario) =>
          prisma.siniestro.create({
            data: {
              numeroSiniestro: `CHAT-${++numero}`,
              numeroPoliza: 'POL',
              idEstadoSiniestro: estado.id,
              idAseguradora: aseguradora.id,
              idUsuario,
              fechaAsignacion: new Date(),
              menorEdadInvolucrado: false,
            },
          })
        const propio = await caso(gestor.id)
        const ajeno = await caso(otroGestor.id)

        servidor = createServer()
        tiempoReal = crearTiempoReal(servidor, { sesiones, base: () => prisma, revisarCadaMs: 300 })
        servidor.listen(0, '127.0.0.1')
        await once(servidor, 'listening')
        const puerto = servidor.address().port

        const cliente = (token, { puertoCliente = puerto, extraHeaders = {} } = {}) => {
          const c = conectarCliente(`http://127.0.0.1:${puertoCliente}`, {
            path: '/socket.io',
            transports: ['websocket'],
            extraHeaders: {
              ...(token ? { cookie: `otra=1; cova_sesion=${token}` } : {}),
              ...extraHeaders,
            },
            reconnectionDelay: 50,
            reconnectionDelayMax: 200,
            timeout: 2_000,
          })
          clientes.push(c)
          return c
        }
        const conectado = async (c) => {
          if (!c.connected) await once(c, 'connect')
          return c
        }
        const errorDeConexion = async (c) => {
          const [error] = await once(c, 'connect_error')
          return error
        }
        const unirse = (c, id) => c.timeout(3_000).emitWithAck('sala:unirse', id)

        // --- Conexión autenticada con la sesión del usuario
        const sinCookie = await errorDeConexion(cliente(null))
        assert.equal(sinCookie.data?.codigo, 'SESION_VENCIDA')
        const inventada = await errorDeConexion(cliente('no-existe'))
        assert.equal(inventada.data?.codigo, 'SESION_VENCIDA')
        const tokenAdmin = await sesiones.crear(admin.id)
        const otroSitio = cliente(tokenAdmin, {
          extraHeaders: { origin: 'https://otro-sitio.example' },
        })
        await errorDeConexion(otroSitio)
        assert.equal(otroSitio.connected, false, 'un handshake desde otro sitio se rechaza')
        otroSitio.disconnect()

        const tokenGestor = await sesiones.crear(gestor.id)
        // Una conexión abierta sin actividad no estira la sesión (RNF-08)
        const viejaActividad = new Date(Date.now() - 10 * 60_000)
        await prisma.sesion.updateMany({
          where: { idUsuario: gestor.id },
          data: { ultimaActividad: viejaActividad },
        })
        const gestorC = await conectado(cliente(tokenGestor))
        const adminC = await conectado(
          cliente(tokenAdmin, { extraHeaders: { origin: `http://127.0.0.1:${puerto}` } }),
        )
        assert.equal(
          (
            await prisma.sesion.findFirstOrThrow({ where: { idUsuario: gestor.id } })
          ).ultimaActividad.getTime(),
          viejaActividad.getTime(),
        )

        // --- Una sala por siniestro, con el permiso controlado antes de unir
        assert.deepEqual(await unirse(gestorC, propio.id), { ok: true })
        const rechazo = await unirse(gestorC, ajeno.id)
        assert.equal(rechazo.ok, false)
        assert.equal(rechazo.status, 403)
        assert.equal((await unirse(gestorC, 2147483647)).status, 404)
        assert.equal((await unirse(gestorC, 'x')).status, 400)
        assert.deepEqual(await unirse(adminC, propio.id), { ok: true })
        assert.deepEqual(
          await unirse(adminC, ajeno.id),
          { ok: true },
          'la administración entra a cualquiera',
        )
        assert.deepEqual([...tiempoReal.conectados(propio.id)].sort(), [admin.id, gestor.id].sort())
        assert.deepEqual([...tiempoReal.conectados(ajeno.id)], [admin.id])

        // Salir de la sala
        gestorC.emit('sala:salir', propio.id)
        await hasta(() => !tiempoReal.conectados(propio.id).has(gestor.id), 'salir de la sala')
        assert.deepEqual(await unirse(gestorC, propio.id), { ok: true })

        // --- Reasignación: el gestor anterior sale de la sala en el momento
        await prisma.siniestro.update({
          where: { id: propio.id },
          data: { idUsuario: otroGestor.id },
        })
        const expulsado = once(gestorC, 'sala:expulsado')
        await tiempoReal.revisarSala(propio.id)
        const [aviso] = await expulsado
        assert.equal(aviso.idSiniestro, propio.id)
        assert.match(aviso.motivo, /no está asignado a vos/)
        assert.ok(!tiempoReal.conectados(propio.id).has(gestor.id))
        assert.ok(tiempoReal.conectados(propio.id).has(admin.id), 'la administración sigue')
        assert.equal((await unirse(gestorC, propio.id)).status, 403)
        await prisma.siniestro.update({ where: { id: propio.id }, data: { idUsuario: gestor.id } })
        assert.deepEqual(await unirse(gestorC, propio.id), { ok: true })

        // emitirASala revisa antes de enviar: un cambio de rol que nadie avisó no deja ver la sala ajena
        await prisma.usuario.update({ where: { id: admin.id }, data: { tipoUsuario: 'GESTOR' } })
        const fuera = once(adminC, 'sala:expulsado')
        await tiempoReal.emitirASala(ajeno.id, 'sala:expulsado', {
          idSiniestro: 0,
          motivo: 'prueba',
        })
        const [{ idSiniestro: idFuera }] = await fuera
        assert.equal(idFuera, ajeno.id)
        assert.ok(!tiempoReal.conectados(ajeno.id).has(admin.id))
        await prisma.usuario.update({
          where: { id: admin.id },
          data: { tipoUsuario: 'ADMINISTRADOR' },
        })

        // --- Sesión cerrada en otro lado (baja, cambio de contraseña): la revisión periódica corta la conexión
        const vencida = once(adminC, 'sesion:vencida')
        await prisma.sesion.deleteMany({ where: { idUsuario: admin.id } })
        await vencida
        await hasta(() => !adminC.connected, 'desconectar la sesión borrada')
        assert.ok(!tiempoReal.conectados(propio.id).has(admin.id))

        // Logout: se corta en el momento solo la conexión de esa sesión
        const otraSesion = await sesiones.crear(gestor.id)
        const segundaPestana = await conectado(cliente(otraSesion))
        const cerrada = once(segundaPestana, 'sesion:vencida')
        tiempoReal.cerrarSesion(otraSesion)
        await cerrada
        assert.ok(gestorC.connected, 'la otra sesión del mismo usuario sigue conectada')

        // --- Reconexión automática cortando la red
        red = await crearRed(puerto)
        const movil = cliente(tokenGestor, { puertoCliente: red.puerto })
        // Como el frontend: al (re)conectar vuelve a entrar a la sala
        let uniones = 0
        movil.on('connect', () => {
          void unirse(movil, propio.id).then((r) => {
            if (r.ok) uniones++
          })
        })
        await hasta(() => uniones === 1, 'primera unión')
        const idAntes = movil.id
        const caida = once(movil, 'disconnect')
        red.cortar()
        const [motivo] = await caida
        assert.equal(motivo, 'transport close')
        await esperar(400) // con la red cortada, los reintentos fallan
        assert.equal(movil.connected, false)
        assert.ok(movil.active, 'sigue reintentando solo')
        red.restablecer()
        await hasta(() => uniones === 2, 'reconexión y nueva unión a la sala')
        assert.notEqual(movil.id, idAntes)
        assert.ok(tiempoReal.conectados(propio.id).has(gestor.id))

        // El servidor corta todas las conexiones al apagarse (deploy): el navegador también vuelve solo
        const apagado = once(movil, 'disconnect')
        tiempoReal.cerrar()
        await apagado
        await hasta(() => uniones === 3, 'reconexión después del corte del servidor')
      } finally {
        for (const c of clientes) c.disconnect()
        tiempoReal?.cerrar()
        await red?.cerrar()
        if (servidor) await new Promise((ok) => servidor.close(() => ok()))
        await disconnectPrisma()
      }
    }),
)
