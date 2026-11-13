import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { io } from 'socket.io-client'
import { conBaseTemporal } from './fixtures/base-temporal.mjs'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioSesiones } from '../src/modules/auth/sesiones.service.ts'
import { crearTiempoReal } from '../src/modules/chat/tiempo-real.ts'
import { escucharCambiosNotificaciones } from '../src/modules/notificaciones/notificaciones-receptor.ts'

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function hasta(condicion, mensaje) {
  const fin = Date.now() + 7000
  while (!(await condicion())) {
    assert.ok(Date.now() < fin, mensaje)
    await esperar(20)
  }
}
test(
  'Avisos personales por PostgreSQL y Socket.IO, posteriores al commit y sin abrir chats',
  { timeout: 90000 },
  async (t) => {
    await conBaseTemporal('avisos_tiempo_real', async () => {
      const db = getPrisma(),
        clientes = []
      let servidor, canal, receptor
      try {
        const usuario = (nombre) =>
          db.usuario.create({
            data: {
              nombres: nombre,
              apellidos: 'Prueba',
              documento: '0',
              telefono: '0',
              email: nombre + '@example.invalid',
              contrasena: '-',
              tipoUsuario: 'GESTOR',
              direccion: { create: {} },
            },
          })
        const uno = await usuario('uno'),
          otro = await usuario('otro')
        const estado = await db.estadoSiniestro.create({
          data: { nombre: 'Abierto', descripcion: 'Prueba' },
        })
        const aseguradora = await db.aseguradora.create({ data: { nombre: 'Tiempo real' } })
        const caso = await db.siniestro.create({
          data: {
            numeroSiniestro: 'REAL-1',
            numeroPoliza: 'P-1',
            fechaAsignacion: new Date(),
            menorEdadInvolucrado: false,
            idUsuario: uno.id,
            idEstadoSiniestro: estado.id,
            idAseguradora: aseguradora.id,
          },
        })
        const sesiones = crearServicioSesiones({ prisma: db, duracionMs: 3600000 })
        let consultasCasos = 0
        canal = crearTiempoReal((servidor = createServer()), {
          sesiones,
          base: () => ({
            usuario: db.usuario,
            siniestro: {
              findFirst: (args) => {
                consultasCasos++
                return db.siniestro.findFirst(args)
              },
            },
          }),
          revisarCadaMs: 30000,
        })
        servidor.listen(0, '127.0.0.1')
        await once(servidor, 'listening')
        let recuperaciones = 0
        receptor = escucharCambiosNotificaciones({
          conexion: () => process.env.DATABASE_URL,
          avisar: (id, nueva) => canal.avisarNotificaciones(id, nueva),
          resincronizar: async () => {
            recuperaciones++
            await canal.resincronizarNotificaciones()
          },
        })
        await receptor.listo
        const token = await sesiones.crear(uno.id)
        const conectar = async (cookie) => {
          const c = io(`http://127.0.0.1:${servidor.address().port}`, {
            path: '/socket.io',
            transports: ['websocket'],
            extraHeaders: { cookie: `cova_sesion=${cookie}` },
            reconnectionDelay: 30,
          })
          clientes.push(c)
          const avisos = []
          c.on('notificaciones:actualizadas', (datos) => avisos.push(datos))
          await once(c, 'connect')
          return { c, avisos }
        }
        const a = await conectar(token),
          pestana = await conectar(token),
          b = await conectar(await sesiones.crear(otro.id))
        const crear = (tx) =>
          tx.notificacion.create({
            data: {
              idUsuario: uno.id,
              idSiniestro: caso.id,
              tipoNotificacion: 'NOVEDAD_CARGADA',
              mensaje: 'Nueva novedad',
              leida: false,
              revisada: false,
            },
          })
        let aviso
        await t.test(
          'Un rollback no avisa y una transacción abierta no avisa antes del commit',
          async () => {
            await assert.rejects(
              db.$transaction(async (tx) => {
                await crear(tx)
                throw Error('rollback')
              }),
              /rollback/,
            )
            await esperar(100)
            assert.equal(a.avisos.length, 0)
            aviso = await db.$transaction(async (tx) => {
              const fila = await crear(tx)
              await esperar(120)
              assert.equal(
                a.avisos.length,
                0,
                'No avisar mientras la transacción no esté confirmada',
              )
              return fila
            })
            await hasta(
              () => a.avisos.length === 1 && pestana.avisos.length === 1,
              'Aviso inmediato en ambas pestañas',
            )
            assert.deepEqual(a.avisos, [{ nueva: true }])
            assert.equal(b.avisos.length, 0, 'Otro usuario no recibe el evento')
            assert.equal(canal.conectados(caso.id).size, 0)
            assert.equal(canal.presentes(caso.id).size, 0)
            assert.equal(
              consultasCasos,
              0,
              'La conexión personal no consulta ni abre salas de siniestros',
            )
          },
        )
        await t.test(
          'Un grupo actualizado es contenido nuevo; leer, revisar y borrar solo invalidan el estado',
          async () => {
            await db.notificacion.update({
              where: { id: aviso.id },
              data: { mensaje: 'Hay 2 mensajes nuevos' },
            })
            await hasta(() => a.avisos.length === 2, 'Actualización del grupo')
            assert.deepEqual(a.avisos.at(-1), { nueva: true })
            await db.notificacion.update({ where: { id: aviso.id }, data: { leida: true } })
            await hasta(() => a.avisos.length === 3, 'Lectura desde otra pestaña')
            assert.deepEqual(a.avisos.at(-1), { nueva: false })
            await db.notificacion.update({ where: { id: aviso.id }, data: { revisada: true } })
            await hasta(() => a.avisos.length === 4, 'Revisión')
            assert.deepEqual(a.avisos.at(-1), { nueva: false })
            await db.notificacion.delete({ where: { id: aviso.id } })
            await hasta(() => a.avisos.length === 5, 'Eliminación')
            assert.deepEqual(a.avisos.at(-1), { nueva: false })
            assert.equal(b.avisos.length, 0)
          },
        )
        await t.test(
          'La escucha vuelve tras perder PostgreSQL y resincroniza cambios ocurridos durante el corte',
          async () => {
            const antes = recuperaciones
            await db.$queryRaw`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND application_name='cova-notificaciones' AND pid<>pg_backend_pid()`
            await crear(db)
            await hasta(() => recuperaciones > antes, 'Reconexión del receptor PostgreSQL')
            await hasta(() => a.avisos.length > 5, 'Resincronización de la bandeja tras reconectar')
            assert.ok(
              (await db.notificacion.count({ where: { idUsuario: uno.id, leida: false } })) > 0,
            )
          },
        )
        await t.test(
          'Una sesión revocada no recibe nuevos avisos, aunque el socket siga conectado',
          async () => {
            const anteriores = a.avisos.length
            await db.sesion.deleteMany({ where: { idUsuario: uno.id } })
            await crear(db)
            await hasta(
              () => !a.c.connected && !pestana.c.connected,
              'Desconexión de sesiones revocadas',
            )
            assert.equal(a.avisos.length, anteriores)
          },
        )
      } finally {
        await receptor?.cerrar()
        for (const c of clientes) c.disconnect()
        canal?.cerrar()
        if (servidor) await new Promise((resolve) => servidor.close(resolve))
        await disconnectPrisma()
      }
    })
  },
)
