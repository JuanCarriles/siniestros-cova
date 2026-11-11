import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'
import { crearSiniestroSchema } from '@cova/shared/schemas/siniestros-alta'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioCrearSiniestro } from '../src/modules/siniestros/siniestros-alta-crear.service.ts'
import { crearServicioEstadoSiniestro } from '../src/modules/siniestros/siniestros-estado.service.ts'
import { crearServicioReasignacion } from '../src/modules/siniestros/siniestros-reasignacion.service.ts'
import { crearServicioNovedadesGestion } from '../src/modules/novedades/novedades-gestion.service.ts'
import { crearServicioNotificaciones } from '../src/modules/notificaciones/notificaciones.service.ts'
import { notificarMensajeNuevo } from '../src/modules/notificaciones/notificaciones-mensaje.ts'

test(
  'E8-02: eventos reales, destinatarios, correo después del commit y chat preparado',
  { timeout: 90000 },
  async (t) => {
    assert.notEqual(process.env.NODE_ENV, 'production')
    const original = process.env.DATABASE_URL
    assert.ok(original, 'Falta DATABASE_URL local')
    const url = new URL(original)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Solo base local')
    const nombre = `cova_test_eventos_${Date.now()}_${process.pid}`
    const control = new pg.Client({ connectionString: original, connectionTimeoutMillis: 5000 })
    await control.connect()
    let creada = false
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
      const base = { transaccion: (trabajo) => db.$transaction(trabajo, { timeout: 15000 }) }
      const bandeja = crearServicioNotificaciones(base)
      const usuario = (nombres, tipoUsuario, eliminado = false) =>
        db.usuario.create({
          data: {
            nombres,
            apellidos: 'Prueba',
            email: nombres + '@example.invalid',
            tipoUsuario,
            eliminado,
            fechaBaja: eliminado ? new Date() : null,
            contrasena: '-',
            documento: '0',
            telefono: '0',
            direccion: { create: {} },
          },
        })
      const admin = await usuario('Admin', 'ADMINISTRADOR')
      const superadmin = await usuario('Super', 'SUPER_ADMINISTRADOR')
      const gestor = await usuario('Gestor', 'GESTOR')
      const otro = await usuario('Otro', 'GESTOR')
      const inactivo = await usuario('Baja', 'ADMINISTRADOR', true)
      const estado = await db.estadoSiniestro.create({
        data: { nombre: 'En tratamiento', descripcion: 'Activo' },
      })
      const siguiente = await db.estadoSiniestro.create({
        data: { nombre: 'En pericia', descripcion: 'Pericias' },
      })
      const aseguradora = await db.aseguradora.create({ data: { nombre: 'Prueba eventos' } })
      let numero = 0
      const caso = (idUsuario = gestor.id) =>
        db.siniestro.create({
          data: {
            numeroSiniestro: 'E8-' + ++numero,
            numeroPoliza: 'P',
            fechaAsignacion: new Date(),
            menorEdadInvolucrado: false,
            idUsuario,
            idAseguradora: aseguradora.id,
            idEstadoSiniestro: estado.id,
          },
        })
      const avisos = (idSiniestro) =>
        db.notificacion.findMany({ where: { idSiniestro }, orderBy: { id: 'asc' } })
      const ids = (filas) => filas.map((n) => n.idUsuario).sort((a, b) => a - b)
      // Cualquier intento de correo no simulado falla: estado/novedad/mensaje solo son internos.
      t.mock.method(globalThis, 'fetch', () => assert.fail('Evento interno no debe enviar correo'))

      await t.test(
        'alta: una asignación privada y un correo, con caso e historial ya confirmados',
        async () => {
          const mails = []
          const servicio = crearServicioCrearSiniestro({
            ...base,
            almacenamiento: () => assert.fail('Sin archivos no debe usar R2'),
            urlSistema: 'https://example.invalid',
            enviarAvisoAsignacion: async (aviso) => {
              const persistido = await db.siniestro.findFirstOrThrow({
                where: { numeroSiniestro: aviso.numeroSiniestro },
              })
              assert.equal(persistido.idUsuario, gestor.id)
              assert.equal((await avisos(persistido.id)).length, 1)
              mails.push(aviso)
            },
          })
          const entrada = crearSiniestroSchema.parse({
            datosCaso: {
              numeroSiniestro: 'ALTA-E8',
              numeroPoliza: 'P',
              idAseguradora: aseguradora.id,
              sucursal: 'Central',
              menorEdadInvolucrado: false,
              lugar: {},
            },
            vehiculos: [],
            personasExternas: [],
            abogados: [],
            peritos: [],
            documentos: [],
            idUsuarioAsignado: gestor.id,
          })
          const creado = await servicio.crear(admin, entrada)
          assert.equal(creado.correoEnviado, true)
          assert.deepEqual(ids(await avisos(creado.id)), [gestor.id])
          assert.equal((await avisos(creado.id))[0].tipoNotificacion, 'ASIGNACION_SINIESTRO')
          assert.deepEqual(
            mails.map((m) => m.email),
            [gestor.email],
          )
          await assert.rejects(servicio.crear(admin, entrada), { status: 409 })
          assert.equal(mails.length, 1)
          assert.equal((await avisos(creado.id)).length, 1)
        },
      )

      await t.test(
        'reasignación: avisos internos a ambos, mail solo al nuevo; fallo de correo no revierte',
        async () => {
          const c = await caso()
          const mails = []
          const servicio = crearServicioReasignacion({
            ...base,
            urlSistema: 'https://example.invalid',
            enviarAviso: async (aviso) => {
              assert.equal(
                (await db.siniestro.findUniqueOrThrow({ where: { id: c.id } })).idUsuario,
                otro.id,
              )
              mails.push(aviso)
            },
          })
          const pedido = { idUsuarioAnterior: gestor.id, idUsuarioNuevo: otro.id, confirmado: true }
          assert.deepEqual(await servicio.reasignar(admin, c.id, pedido), { correosEnviados: true })
          assert.deepEqual(
            ids(await avisos(c.id)),
            [gestor.id, otro.id].sort((a, b) => a - b),
          )
          assert.deepEqual(
            mails.map((m) => m.email),
            [otro.email],
          )
          assert.equal(
            (await bandeja.listar(gestor, 1)).items.find((n) => n.siniestro.id === c.id)
              .puedeAbrirSiniestro,
            false,
          )
          await assert.rejects(servicio.reasignar(admin, c.id, pedido), { status: 409 })
          assert.equal(mails.length, 1)
          const fallido = await caso()
          const registros = []
          const captura = t.mock.method(console, 'error', (...args) =>
            registros.push(args.join(' ')),
          )
          const sinCorreo = crearServicioReasignacion({
            ...base,
            urlSistema: 'https://example.invalid',
            enviarAviso: async () => {
              throw new Error('SECRETO')
            },
          })
          assert.deepEqual(await sinCorreo.reasignar(admin, fallido.id, pedido), {
            correosEnviados: false,
          })
          assert.equal((await avisos(fallido.id)).length, 2)
          assert.ok(registros.length && registros.every((l) => !l.includes('SECRETO')))
          captura.mock.restore()
        },
      )

      await t.test(
        'estado y novedad: asignado y administración activa, sin autor ni duplicados; eventos conservados',
        async () => {
          const c = await caso(superadmin.id)
          await crearServicioEstadoSiniestro(base).cambiar(admin, c.id, {
            idEstadoAnterior: estado.id,
            idEstadoSiniestro: siguiente.id,
          })
          const estados = await avisos(c.id)
          assert.deepEqual(ids(estados), [superadmin.id])
          assert.ok(
            estados.every((n) => n.tipoNotificacion === 'CAMBIO_ESTADO' && !n.leida && !n.revisada),
          )
          const novedades = crearServicioNovedadesGestion(base)
          const datos = { descripcion: 'Novedad de prueba', claveEnvio: randomUUID() }
          const n = await novedades.cargar(superadmin, c.id, datos)
          assert.deepEqual(await novedades.cargar(superadmin, c.id, datos), n)
          await novedades.cargar(superadmin, c.id, { ...datos, claveEnvio: randomUUID() })
          const todas = await avisos(c.id)
          assert.equal(todas.length, 3)
          assert.equal(todas[0].id, estados[0].id)
          assert.equal(todas[0].mensaje, estados[0].mensaje)
          assert.deepEqual(
            todas.slice(1).map((n) => [n.idUsuario, n.tipoNotificacion]),
            [
              [admin.id, 'NOVEDAD_CARGADA'],
              [admin.id, 'NOVEDAD_CARGADA'],
            ],
          )
          assert.ok(todas.every((n) => n.idUsuario !== inactivo.id && n.idUsuario !== otro.id))
          const ajeno = await caso()
          await assert.rejects(
            novedades.cargar(otro, ajeno.id, {
              descripcion: 'No permitido',
              claveEnvio: randomUUID(),
            }),
            { status: 403 },
          )
          assert.equal((await avisos(ajeno.id)).length, 0)
        },
      )

      await t.test('si falla un aviso se revierte también el cambio y el historial', async () => {
        const c = await caso()
        const fallo = new Error('No se pudo guardar aviso')
        const servicio = crearServicioEstadoSiniestro({
          transaccion: (trabajo) =>
            db.$transaction((tx) =>
              trabajo(
                new Proxy(tx, {
                  get(target, key) {
                    if (key === 'notificacion')
                      return {
                        createMany: async () => {
                          throw fallo
                        },
                      }
                    return Reflect.get(target, key)
                  },
                }),
              ),
            ),
        })
        await assert.rejects(
          servicio.cambiar(admin, c.id, {
            idEstadoAnterior: estado.id,
            idEstadoSiniestro: siguiente.id,
          }),
          (e) => e === fallo,
        )
        assert.equal(
          (await db.siniestro.findUniqueOrThrow({ where: { id: c.id } })).idEstadoSiniestro,
          estado.id,
        )
        assert.equal(await db.historialSiniestro.count({ where: { idSiniestro: c.id } }), 0)
        assert.equal((await avisos(c.id)).length, 0)
      })

      await t.test(
        'hook de chat: dos mensajes simultáneos agrupan pendientes; leído genera otro aviso',
        async () => {
          const c = await caso()
          const enviar = (autor) =>
            base.transaccion(async (tx) => {
              const m = await tx.mensajeChat.create({
                data: {
                  idSiniestro: c.id,
                  idUsuario: autor.id,
                  autor: 'Autor Prueba',
                  contenidoMensaje: 'Texto privado del chat',
                },
              })
              await notificarMensajeNuevo(tx, m.id)
              return m
            })
          await Promise.all([enviar(gestor), enviar(gestor)])
          const pendientes = await avisos(c.id)
          assert.deepEqual(
            ids(pendientes),
            [admin.id, superadmin.id].sort((a, b) => a - b),
          )
          assert.ok(
            pendientes.every(
              (n) => n.tipoNotificacion === 'MENSAJE_NUEVO' && !n.mensaje.includes('Texto privado'),
            ),
          )
          const avisoAdmin = pendientes.find((n) => n.idUsuario === admin.id)
          await bandeja.leer(admin, avisoAdmin.id)
          await enviar(gestor)
          assert.equal((await avisos(c.id)).length, 3)
          assert.equal(
            (await db.notificacion.findUniqueOrThrow({ where: { id: avisoAdmin.id } })).leida,
            true,
          )
          await assert.rejects(enviar(otro), { status: 403 })
          assert.equal(await db.mensajeChat.count({ where: { idSiniestro: c.id } }), 3)
          const rollback = new Error('Revertir envío')
          await assert.rejects(
            base.transaccion(async (tx) => {
              const m = await tx.mensajeChat.create({
                data: {
                  idSiniestro: c.id,
                  idUsuario: gestor.id,
                  autor: 'Gestor Prueba',
                  contenidoMensaje: 'No persistir',
                },
              })
              await notificarMensajeNuevo(tx, m.id)
              throw rollback
            }),
            (e) => e === rollback,
          )
          assert.equal((await avisos(c.id)).length, 3)
          assert.equal(await db.mensajeChat.count({ where: { idSiniestro: c.id } }), 3)
        },
      )
    } finally {
      await disconnectPrisma()
      process.env.DATABASE_URL = original
      if (creada) await control.query(`DROP DATABASE "${nombre}" WITH (FORCE)`)
      await control.end()
    }
  },
)
