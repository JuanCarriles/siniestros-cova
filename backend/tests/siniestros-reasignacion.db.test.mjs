import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import pg from 'pg'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioReasignacion } from '../src/modules/siniestros/siniestros-reasignacion.service.ts'
import { crearServicioNotificaciones } from '../src/modules/notificaciones/notificaciones.service.ts'
import { crearServicioSiniestros } from '../src/modules/siniestros/siniestros.service.ts'
import { bandejaNotificacionesSchema } from '@cova/shared/schemas/bandeja-notificaciones'

test(
  'PostgreSQL: carga, permisos, confirmación, historial, avisos, concurrencia y rollback',
  { timeout: 60000 },
  async (t) => {
    assert.notEqual(process.env.NODE_ENV, 'production')
    const original = process.env.DATABASE_URL
    assert.ok(original, 'Falta DATABASE_URL local')
    const url = new URL(original)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Solo base local')
    const nombreDb = `cova_test_reasignacion_${Date.now()}_${process.pid}`
    assert.match(nombreDb, /^cova_test_reasignacion_\d+_\d+$/)
    const adminPg = new pg.Client({ connectionString: original, connectionTimeoutMillis: 5000 })
    await adminPg.connect()
    let creada = false,
      sql
    try {
      await adminPg.query(`CREATE DATABASE "${nombreDb}"`)
      creada = true
      url.pathname = '/' + nombreDb
      url.searchParams.delete('schema')
      process.env.DATABASE_URL = url.toString()
      sql = new pg.Client({ connectionString: url.toString() })
      await sql.connect()
      const carpeta = new URL('../prisma/migrations/', import.meta.url)
      for (const nombre of (await readdir(carpeta, { withFileTypes: true }))
        .filter((x) => x.isDirectory())
        .map((x) => x.name)
        .sort())
        await sql.query(await readFile(new URL(nombre + '/migration.sql', carpeta), 'utf8'))
      const prisma = getPrisma()
      const ahora = new Date('2026-11-02T18:00:00Z'),
        inicial = new Date('2026-10-01T12:00:00Z')
      const mails = []
      const deps = {
        transaccion: (trabajo) => prisma.$transaction(trabajo, { timeout: 15000 }),
        urlSistema: 'https://cova.example.invalid/',
        enviarAviso: async (a) => {
          const persistido = await prisma.siniestro.findFirstOrThrow({
            where: { numeroSiniestro: a.numeroSiniestro },
            include: { usuario: true },
          })
          assert.equal(`${persistido.usuario.nombres} ${persistido.usuario.apellidos}`, a.nuevo)
          assert.equal(
            await prisma.historialSiniestro.count({
              where: { idSiniestro: persistido.id, tipoEvento: 'REASIGNACION' },
            }),
            1,
          )
          mails.push(a)
        },
      }
      const servicio = crearServicioReasignacion(deps, () => ahora)
      const avisos = crearServicioNotificaciones(deps)
      const nuevoUsuario = (nombres, tipoUsuario, eliminado = false) =>
        prisma.usuario.create({
          data: {
            nombres,
            apellidos: 'Prueba',
            tipoUsuario,
            eliminado,
            fechaBaja: eliminado ? inicial : null,
            documento: '0',
            telefono: '0',
            email: `${nombres}@example.invalid`,
            contrasena: '-',
            direccion: { create: {} },
          },
        })
      const admin = await nuevoUsuario('Admin', 'ADMINISTRADOR'),
        superadmin = await nuevoUsuario('Super', 'SUPER_ADMINISTRADOR'),
        anterior = await nuevoUsuario('Anterior', 'GESTOR'),
        nuevo = await nuevoUsuario('Nuevo', 'GESTOR'),
        otro = await nuevoUsuario('Otro', 'GESTOR'),
        inactivo = await nuevoUsuario('Inactivo', 'GESTOR', true)
      const estado = await prisma.estadoSiniestro.create({
        data: { nombre: 'Activo', descripcion: 'Abierto' },
      })
      const cerrado = await prisma.estadoSiniestro.create({
        data: { nombre: 'Cierre enviado', descripcion: 'Finalizado', esCierre: true },
      })
      const aseguradora = await prisma.aseguradora.create({
        data: { nombre: 'Aseguradora de prueba' },
      })
      let numero = 0
      const caso = (extra = {}) =>
        prisma.siniestro.create({
          data: {
            numeroSiniestro: `CASO-${++numero}`,
            numeroPoliza: 'P',
            fechaAsignacion: inicial,
            fechaUltimoMovimiento: inicial,
            menorEdadInvolucrado: false,
            idAseguradora: aseguradora.id,
            idEstadoSiniestro: estado.id,
            idUsuario: anterior.id,
            ...extra,
          },
        })
      const s = await caso()
      await caso({ idUsuario: nuevo.id })
      await caso({ idUsuario: nuevo.id })
      await caso({ idUsuario: nuevo.id, eliminado: true, fechaBaja: inicial })
      await caso({ idUsuario: nuevo.id, eliminacionEnCurso: true })
      await caso({ idUsuario: nuevo.id, idEstadoSiniestro: cerrado.id })
      const opciones = await servicio.opciones(admin, s.id)
      assert.equal(opciones.anterior.id, anterior.id)
      assert.equal(opciones.usuarios.find((u) => u.id === nuevo.id).casosActivos, 2)
      assert.ok(opciones.usuarios.some((u) => u.id === superadmin.id))
      assert.ok(!opciones.usuarios.some((u) => u.id === anterior.id || u.id === inactivo.id))
      assert.ok(opciones.usuarios.every((u) => !('email' in u) && !('contrasena' in u)))
      const pedido = { idUsuarioAnterior: anterior.id, idUsuarioNuevo: nuevo.id, confirmado: true }
      await assert.rejects(servicio.opciones(anterior, s.id), { status: 403 })
      await assert.rejects(
        servicio.reasignar({ ...anterior, tipoUsuario: 'SUPER_ADMINISTRADOR' }, s.id, pedido),
        { status: 403 },
      )
      await assert.rejects(servicio.reasignar(admin, s.id, { ...pedido, confirmado: false }), {
        name: 'ZodError',
      })
      await assert.rejects(
        servicio.reasignar(admin, s.id, { ...pedido, idUsuarioNuevo: anterior.id }),
        { status: 409 },
      )
      await assert.rejects(
        servicio.reasignar(admin, s.id, { ...pedido, idUsuarioNuevo: inactivo.id }),
        { status: 409 },
      )
      await assert.rejects(servicio.opciones(admin, 999999), { status: 404 })
      assert.equal(await prisma.historialSiniestro.count(), 0)
      assert.equal(mails.length, 0)
      await prisma.historialSiniestro.create({
        data: {
          idSiniestro: s.id,
          idUsuario: admin.id,
          tipoEvento: 'ASIGNACION',
          descripcion: 'Evento anterior',
          fechaEvento: inicial,
        },
      })
      assert.deepEqual(await servicio.reasignar(admin, s.id, pedido), { correosEnviados: true })
      const guardado = await prisma.siniestro.findUniqueOrThrow({ where: { id: s.id } })
      assert.equal(guardado.idUsuario, nuevo.id)
      assert.equal(guardado.fechaAsignacion.toISOString(), inicial.toISOString())
      assert.equal(guardado.fechaUltimoMovimiento.toISOString(), inicial.toISOString())
      const historial = await prisma.historialSiniestro.findMany({
        where: { idSiniestro: s.id },
        orderBy: { id: 'asc' },
      })
      assert.equal(historial.length, 2)
      assert.equal(historial[0].descripcion, 'Evento anterior')
      assert.equal(historial[1].tipoEvento, 'REASIGNACION')
      assert.equal(historial[1].idUsuario, admin.id)
      assert.equal(historial[1].fechaEvento.toISOString(), ahora.toISOString())
      assert.match(
        historial[1].descripcion,
        /Se reasignó el caso de Anterior Prueba a Nuevo Prueba/,
      )
      const notificaciones = await prisma.notificacion.findMany({ where: { idSiniestro: s.id } })
      assert.deepEqual(
        notificaciones.map((n) => n.idUsuario).sort((a, b) => a - b),
        [anterior.id, nuevo.id].sort((a, b) => a - b),
      )
      assert.ok(
        notificaciones.every(
          (n) => !n.leida && !n.revisada && n.tipoNotificacion === 'REASIGNACION_SINIESTRO',
        ),
      )
      assert.deepEqual(
        mails.map((m) => m.email),
        [nuevo.email],
      )
      assert.equal(
        mails.some((m) => m.email === anterior.email),
        false,
      )
      assert.equal(
        mails.find((m) => m.email === nuevo.email).enlace,
        `https://cova.example.invalid/siniestros/${s.id}`,
      )
      const previo = bandejaNotificacionesSchema.parse(await avisos.listar(anterior, 1))
      assert.equal(previo.items[0].puedeAbrirSiniestro, false)
      await avisos.leer(anterior, previo.items[0].id)
      await assert.rejects(avisos.leer(otro, previo.items[0].id), { status: 404 })
      assert.equal((await avisos.listar(nuevo, 1)).items[0].puedeAbrirSiniestro, true)
      await assert.rejects(crearServicioSiniestros(prisma).obtener(anterior, s.id), { status: 403 })
      assert.equal(
        (await crearServicioSiniestros(prisma).obtener(nuevo, s.id)).asignado.id,
        nuevo.id,
      )
      await assert.rejects(servicio.reasignar(admin, s.id, pedido), { status: 409 })
      assert.equal(mails.length, 1)

      const casoInactivo = await caso({ idUsuario: inactivo.id })
      const antesMails = mails.length
      await servicio.reasignar(admin, casoInactivo.id, {
        ...pedido,
        idUsuarioAnterior: inactivo.id,
      })
      assert.equal(mails.length, antesMails + 1)
      assert.equal(mails.at(-1).email, nuevo.email)
      const avisosInactivo = await prisma.notificacion.findMany({
        where: { idSiniestro: casoInactivo.id },
      })
      assert.equal(avisosInactivo.length, 1)
      assert.equal(avisosInactivo[0].idUsuario, nuevo.id)
      assert.equal(await prisma.notificacion.count({ where: { idUsuario: inactivo.id } }), 0)
      const casoCerrado = await caso({ idEstadoSiniestro: cerrado.id })
      await assert.rejects(servicio.opciones(admin, casoCerrado.id), { status: 409 })
      await assert.rejects(servicio.reasignar(admin, casoCerrado.id, pedido), { status: 409 })
      assert.equal(
        (await prisma.siniestro.findUniqueOrThrow({ where: { id: casoCerrado.id } })).idUsuario,
        anterior.id,
      )
      assert.equal(
        await prisma.historialSiniestro.count({ where: { idSiniestro: casoCerrado.id } }),
        0,
      )
      assert.equal(await prisma.notificacion.count({ where: { idSiniestro: casoCerrado.id } }), 0)

      const simultaneo = await caso()
      const carreras = await Promise.allSettled(
        [nuevo, otro].map((u) =>
          servicio.reasignar(superadmin, simultaneo.id, { ...pedido, idUsuarioNuevo: u.id }),
        ),
      )
      assert.equal(carreras.filter((r) => r.status === 'fulfilled').length, 1)
      assert.equal(carreras.find((r) => r.status === 'rejected').reason.status, 409)
      assert.equal(
        await prisma.historialSiniestro.count({ where: { idSiniestro: simultaneo.id } }),
        1,
      )
      assert.equal(await prisma.notificacion.count({ where: { idSiniestro: simultaneo.id } }), 2)

      const rollback = await caso()
      const errorRegistro = new Error('Historial no disponible')
      const fallando = crearServicioReasignacion({
        ...deps,
        transaccion: (trabajo) =>
          prisma.$transaction((tx) =>
            trabajo(
              new Proxy(tx, {
                get(target, key) {
                  if (key === 'historialSiniestro')
                    return {
                      create: async () => {
                        throw errorRegistro
                      },
                    }
                  return Reflect.get(target, key)
                },
              }),
            ),
          ),
      })
      const cantidadMails = mails.length
      await assert.rejects(
        fallando.reasignar(admin, rollback.id, pedido),
        (e) => e === errorRegistro,
      )
      assert.equal(
        (await prisma.siniestro.findUniqueOrThrow({ where: { id: rollback.id } })).idUsuario,
        anterior.id,
      )
      assert.equal(await prisma.notificacion.count({ where: { idSiniestro: rollback.id } }), 0)
      assert.equal(mails.length, cantidadMails)

      const correoFallido = await caso()
      const logs = []
      t.mock.method(console, 'error', (...args) => logs.push(args.join(' ')))
      const sinCorreo = crearServicioReasignacion({
        ...deps,
        enviarAviso: async () => {
          throw new Error('NO_PUBLICAR_SECRETOS')
        },
      })
      assert.deepEqual(await sinCorreo.reasignar(admin, correoFallido.id, pedido), {
        correosEnviados: false,
      })
      assert.equal(
        (await prisma.siniestro.findUniqueOrThrow({ where: { id: correoFallido.id } })).idUsuario,
        nuevo.id,
      )
      assert.equal(await prisma.notificacion.count({ where: { idSiniestro: correoFallido.id } }), 2)
      assert.ok(logs.length && logs.every((l) => !l.includes('NO_PUBLICAR_SECRETOS')))
      const baja = await caso({ eliminado: true, fechaBaja: inicial }),
        borrando = await caso({ eliminacionEnCurso: true })
      for (const c of [baja, borrando]) {
        await assert.rejects(servicio.opciones(admin, c.id), { status: 409 })
        await assert.rejects(servicio.reasignar(admin, c.id, pedido), { status: 409 })
      }
    } finally {
      await disconnectPrisma()
      if (sql) await sql.end()
      process.env.DATABASE_URL = original
      if (creada) await adminPg.query(`DROP DATABASE "${nombreDb}" WITH (FORCE)`)
      await adminPg.end()
    }
  },
)
