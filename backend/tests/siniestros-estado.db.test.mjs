import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'
import express from 'express'
import cookieParser from 'cookie-parser'
import { crearRequerirSesion } from '../src/middlewares/autenticar.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { crearSiniestrosRouter } from '../src/modules/siniestros/siniestros.routes.ts'
import { opcionesCambioEstadoSchema } from '@cova/shared/schemas/cambio-estado-siniestro'
import { bandejaNotificacionesSchema } from '@cova/shared/schemas/bandeja-notificaciones'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioEstadoSiniestro } from '../src/modules/siniestros/siniestros-estado.service.ts'
import { crearServicioNotificaciones } from '../src/modules/notificaciones/notificaciones.service.ts'
import { crearServicioDashboardAdministrador } from '../src/modules/dashboard/dashboard-administrador.service.ts'

// Cada test usa su propia base temporal, migrada desde cero y eliminada al terminar.
// El servicio y la prueba HTTP no dependen de las mutaciones del otro test.
async function conBaseDeEstados(comprobar) {
  const original = process.env.DATABASE_URL
  assert.ok(original, 'Hace falta DATABASE_URL local con permiso CREATEDB')
  const conexion = new URL(original)
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(conexion.hostname))
  const nombreBase = `cova_test_estados_${Date.now()}_${process.pid}`
  assert.match(nombreBase, /^cova_test_estados_\d+_\d+$/)
  const adminPg = new pg.Client({ connectionString: original })
  await adminPg.connect()
  let creada = false
  try {
    await adminPg.query(`CREATE DATABASE "${nombreBase}"`)
    creada = true
    conexion.pathname = `/${nombreBase}`
    process.env.DATABASE_URL = conexion.href
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
    const ahora = new Date('2026-11-02T15:30:00Z')
    const antes = new Date('2026-10-20T12:00:00Z')
    const base = { transaccion: (trabajo) => prisma.$transaction(trabajo, { timeout: 15_000 }) }
    const servicio = crearServicioEstadoSiniestro(base, () => ahora)
    const avisos = crearServicioNotificaciones(base)
    const dashboard = crearServicioDashboardAdministrador(
      { lectura: base.transaccion },
      () => ahora,
    )
    const usuario = (nombres, tipoUsuario, eliminado = false) =>
      prisma.usuario.create({
        data: {
          nombres,
          apellidos: 'Prueba',
          tipoUsuario,
          eliminado,
          fechaBaja: eliminado ? antes : null,
          email: `${nombres}@example.invalid`,
          documento: '0',
          telefono: '0',
          contrasena: '-',
          direccion: { create: {} },
        },
      })
    const admin = await usuario('Admin', 'ADMINISTRADOR')
    const superadmin = await usuario('Super', 'SUPER_ADMINISTRADOR')
    const otroAdmin = await usuario('OtroAdmin', 'ADMINISTRADOR')
    const gestor = await usuario('Gestor', 'GESTOR')
    const ajeno = await usuario('Ajeno', 'GESTOR')
    const retirado = await usuario('Retirado', 'ADMINISTRADOR', true)
    const estado = (nombre, extra = {}) =>
      prisma.estadoSiniestro.create({
        data: { nombre, descripcion: `Explicación de ${nombre}`, ...extra },
      })
    const inicial = await estado('Estado inicial propio')
    const nuevo = await estado('Estado configurado por el equipo')
    const cierre = await estado('Final personalizado', { esCierre: true })
    const noDisponible = await estado('Retirado', { eliminado: true, fechaBaja: antes })
    const aseguradora = await prisma.aseguradora.create({ data: { nombre: 'Prueba' } })
    let numero = 0
    const caso = (extra = {}) =>
      prisma.siniestro.create({
        data: {
          numeroSiniestro: `ESTADO-${++numero}`,
          numeroPoliza: 'POL',
          idEstadoSiniestro: inicial.id,
          idAseguradora: aseguradora.id,
          idUsuario: gestor.id,
          fechaAsignacion: antes,
          fechaUltimoMovimiento: antes,
          menorEdadInvolucrado: false,
          ...extra,
        },
      })
    const siniestro = await caso()
    const previo = await prisma.historialSiniestro.create({
      data: {
        idSiniestro: siniestro.id,
        idUsuario: admin.id,
        tipoEvento: 'ASIGNACION',
        descripcion: 'Actividad previa inmutable',
        fechaEvento: antes,
      },
    })
    const cambiar = (actor, casoId, desde, hacia) =>
      servicio.cambiar(actor, casoId, { idEstadoAnterior: desde.id, idEstadoSiniestro: hacia.id })

    await comprobar({
      prisma,
      ahora,
      servicio,
      avisos,
      dashboard,
      admin,
      superadmin,
      otroAdmin,
      gestor,
      ajeno,
      retirado,
      estado,
      inicial,
      nuevo,
      cierre,
      noDisponible,
      caso,
      siniestro,
      previo,
      cambiar,
    })
  } finally {
    await disconnectPrisma()
    process.env.DATABASE_URL = original
    if (creada) await adminPg.query(`DROP DATABASE "${nombreBase}" WITH (FORCE)`)
    await adminPg.end()
  }
}

test(
  'cambio de estado real: permisos, catálogo, historial, movimiento, cierre, concurrencia y avisos privados',
  { timeout: 90_000 },
  () =>
    conBaseDeEstados(
      async ({
        prisma,
        ahora,
        servicio,
        avisos,
        dashboard,
        admin,
        superadmin,
        otroAdmin,
        gestor,
        ajeno,
        retirado,
        estado,
        inicial,
        nuevo,
        cierre,
        noDisponible,
        caso,
        siniestro,
        previo,
        cambiar,
      }) => {
        // El gestor consulta solo sus casos y nunca recibe estados de cierre en el catálogo.
        const opcionesGestor = opcionesCambioEstadoSchema.parse(
          await servicio.opciones(gestor, siniestro.id),
        )
        assert.deepEqual(
          opcionesGestor.estados.map((e) => e.id),
          [inicial.id, nuevo.id],
        )
        for (const actor of [ajeno, { ...ajeno, tipoUsuario: 'SUPER_ADMINISTRADOR' }]) {
          await assert.rejects(servicio.opciones(actor, siniestro.id), { status: 403 })
          await assert.rejects(cambiar(actor, siniestro.id, inicial, nuevo), { status: 403 })
        }
        for (const actor of [gestor, { ...gestor, tipoUsuario: 'SUPER_ADMINISTRADOR' }])
          await assert.rejects(cambiar(actor, siniestro.id, inicial, cierre), { status: 403 })
        assert.equal(
          await prisma.historialSiniestro.count({ where: { idSiniestro: siniestro.id } }),
          1,
        )
        assert.equal(await prisma.notificacion.count({ where: { idSiniestro: siniestro.id } }), 0)
        await assert.rejects(cambiar(retirado, siniestro.id, inicial, nuevo), { status: 401 })
        await assert.rejects(servicio.opciones(admin, 999999), { status: 404 })
        const opciones = opcionesCambioEstadoSchema.parse(
          await servicio.opciones(superadmin, siniestro.id),
        )
        assert.equal(opciones.estadoActual.id, inicial.id)
        assert.deepEqual(
          opciones.estados.map((e) => e.id),
          [inicial.id, nuevo.id, cierre.id],
        )
        const agregado = await estado('Agregado sin tocar código')
        assert.ok(
          (await servicio.opciones(admin, siniestro.id)).estados.some((e) => e.id === agregado.id),
        )

        await cambiar(admin, siniestro.id, inicial, nuevo)
        const actualizado = await prisma.siniestro.findUniqueOrThrow({
          where: { id: siniestro.id },
        })
        assert.equal(actualizado.idEstadoSiniestro, nuevo.id)
        assert.equal(actualizado.fechaUltimoMovimiento.toISOString(), ahora.toISOString())
        assert.equal(actualizado.fechaCierre, null)
        const historial = await prisma.historialSiniestro.findMany({
          where: { idSiniestro: siniestro.id },
          orderBy: { id: 'asc' },
        })
        assert.equal(historial.length, 2)
        assert.deepEqual(historial[0], previo)
        assert.equal(historial[1].idUsuario, admin.id)
        assert.equal(historial[1].tipoEvento, 'CAMBIO_ESTADO')
        assert.equal(historial[1].fechaEvento.toISOString(), ahora.toISOString())
        assert.ok(
          historial[1].descripcion.includes(inicial.nombre) &&
            historial[1].descripcion.includes(nuevo.nombre),
        )
        const notificaciones = await prisma.notificacion.findMany({
          where: { idSiniestro: siniestro.id },
          orderBy: { idUsuario: 'asc' },
        })
        assert.deepEqual(
          notificaciones.map((n) => n.idUsuario),
          [superadmin.id, otroAdmin.id, gestor.id].sort((a, b) => a - b),
        )
        for (const n of notificaciones) {
          assert.equal(n.tipoNotificacion, 'CAMBIO_ESTADO')
          assert.equal(n.leida, false)
          assert.equal(n.revisada, false)
          assert.equal(n.fechaCreacion.toISOString(), ahora.toISOString())
          assert.ok(
            n.mensaje.includes(siniestro.numeroSiniestro) && n.mensaje.includes(nuevo.nombre),
          )
        }
        assert.ok(
          (await dashboard.obtener(admin, { pagina: 1 })).actividad.items.some(
            (e) => e.id === historial[1].id,
          ),
        )

        for (const [desde, hacia, status] of [
          [inicial, cierre, 409],
          [nuevo, nuevo, 409],
          [nuevo, noDisponible, 400],
          [nuevo, { id: 999999 }, 400],
        ])
          await assert.rejects(cambiar(admin, siniestro.id, desde, hacia), { status })
        assert.equal(
          await prisma.historialSiniestro.count({ where: { idSiniestro: siniestro.id } }),
          2,
        )
        assert.equal(await prisma.notificacion.count({ where: { idSiniestro: siniestro.id } }), 3)

        // Una falla al guardar los avisos revierte también el estado, la fecha y el historial.
        const falla = crearServicioEstadoSiniestro(
          {
            transaccion: (trabajo) =>
              prisma.$transaction((tx) =>
                trabajo(
                  new Proxy(tx, {
                    get(obj, clave) {
                      return clave === 'notificacion'
                        ? {
                            createMany: async () => {
                              throw new Error('Fallo simulado de avisos')
                            },
                          }
                        : Reflect.get(obj, clave)
                    },
                  }),
                ),
              ),
          },
          () => ahora,
        )
        await assert.rejects(
          falla.cambiar(admin, siniestro.id, {
            idEstadoAnterior: nuevo.id,
            idEstadoSiniestro: cierre.id,
          }),
          /Fallo simulado/,
        )
        assert.equal(
          (await prisma.siniestro.findUniqueOrThrow({ where: { id: siniestro.id } }))
            .idEstadoSiniestro,
          nuevo.id,
        )
        assert.equal(
          await prisma.historialSiniestro.count({ where: { idSiniestro: siniestro.id } }),
          2,
        )

        // Dos confirmaciones sobre el mismo estado: una sola operación puede aplicarse.
        const resultados = await Promise.allSettled([
          cambiar(admin, siniestro.id, nuevo, cierre),
          cambiar(superadmin, siniestro.id, nuevo, agregado),
        ])
        assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1)
        assert.equal(resultados.find((r) => r.status === 'rejected').reason.status, 409)
        let actual = await prisma.siniestro.findUniqueOrThrow({ where: { id: siniestro.id } })
        if (actual.idEstadoSiniestro !== cierre.id)
          await cambiar(superadmin, siniestro.id, agregado, cierre)
        actual = await prisma.siniestro.findUniqueOrThrow({ where: { id: siniestro.id } })
        assert.equal(actual.fechaCierre.toISOString(), ahora.toISOString())
        await cambiar(superadmin, siniestro.id, cierre, inicial)
        assert.equal(
          (await prisma.siniestro.findUniqueOrThrow({ where: { id: siniestro.id } })).fechaCierre,
          null,
        )

        for (const extra of [{ eliminado: true, fechaBaja: ahora }, { eliminacionEnCurso: true }]) {
          const bloqueado = await caso(extra)
          await assert.rejects(servicio.opciones(admin, bloqueado.id), { status: 409 })
          await assert.rejects(cambiar(admin, bloqueado.id, inicial, nuevo), { status: 409 })
          assert.equal(
            await prisma.historialSiniestro.count({ where: { idSiniestro: bloqueado.id } }),
            0,
          )
        }
        const cerradoSinResponsable = await caso({
          idUsuario: retirado.id,
          idEstadoSiniestro: cierre.id,
        })
        await assert.rejects(cambiar(admin, cerradoSinResponsable.id, cierre, inicial), {
          status: 409,
        })
        // Responsable administrador: no recibe dos avisos por pertenecer a ambos grupos.
        const asignadoAdmin = await caso({ idUsuario: otroAdmin.id })
        await cambiar(admin, asignadoAdmin.id, inicial, nuevo)
        assert.equal(
          await prisma.notificacion.count({
            where: { idSiniestro: asignadoAdmin.id, idUsuario: otroAdmin.id },
          }),
          1,
        )

        // RF-18: el gestor solicita el cierre; administración recibe el aviso y lo confirma.
        const solicitud = await estado('Solicitud de cierre')
        const casoGestor = await caso()
        await cambiar(gestor, casoGestor.id, inicial, solicitud)
        const pedido = await prisma.siniestro.findUniqueOrThrow({ where: { id: casoGestor.id } })
        assert.equal(pedido.idEstadoSiniestro, solicitud.id)
        assert.equal(pedido.fechaCierre, null)
        assert.equal(pedido.fechaUltimoMovimiento.toISOString(), ahora.toISOString())
        const eventoGestor = await prisma.historialSiniestro.findFirstOrThrow({
          where: { idSiniestro: casoGestor.id },
        })
        assert.equal(eventoGestor.idUsuario, gestor.id)
        assert.equal(eventoGestor.tipoEvento, 'CAMBIO_ESTADO')
        assert.equal(eventoGestor.fechaEvento.toISOString(), ahora.toISOString())
        const avisosGestor = await prisma.notificacion.findMany({
          where: { idSiniestro: casoGestor.id },
          orderBy: { idUsuario: 'asc' },
        })
        assert.deepEqual(
          avisosGestor.map((n) => n.idUsuario),
          [admin.id, superadmin.id, otroAdmin.id].sort((a, b) => a - b),
        )
        await cambiar(admin, casoGestor.id, solicitud, cierre)
        for (const actor of [gestor, { ...gestor, tipoUsuario: 'ADMINISTRADOR' }]) {
          await assert.rejects(servicio.opciones(actor, casoGestor.id), { status: 409 })
          await assert.rejects(cambiar(actor, casoGestor.id, cierre, inicial), { status: 409 })
        }
        assert.equal(
          await prisma.historialSiniestro.count({ where: { idSiniestro: casoGestor.id } }),
          2,
        )
        // Mantener aisladas las comprobaciones de la bandeja original de este test.
        await prisma.notificacion.deleteMany({ where: { idSiniestro: casoGestor.id } })

        const bandeja = bandejaNotificacionesSchema.parse(await avisos.listar(gestor, 1))
        assert.ok(bandeja.items.length > 0)
        assert.ok(bandeja.items.every((n) => n.siniestro.id === siniestro.id))
        assert.equal((await avisos.listar(ajeno, 1)).total, 0)
        const propia = bandeja.items[0]
        await assert.rejects(avisos.leer(ajeno, propia.id), { status: 404 })
        await avisos.leer(gestor, propia.id)
        await avisos.leer(gestor, propia.id)
        assert.equal((await avisos.listar(gestor, 1)).sinLeer, bandeja.sinLeer - 1)
        await prisma.siniestro.update({
          where: { id: siniestro.id },
          data: { eliminado: true, fechaBaja: ahora },
        })
        assert.equal((await avisos.listar(gestor, 1)).total, 0)
        assert.ok(
          (await avisos.listar(otroAdmin, 1)).items.some((n) => n.siniestro.id === siniestro.id),
        )
        await assert.rejects(avisos.leer(gestor, propia.id), { status: 404 })
        await prisma.siniestro.update({
          where: { id: siniestro.id },
          data: { eliminado: false, fechaBaja: null, idUsuario: ajeno.id },
        })
        assert.equal(
          (await avisos.listar(gestor, 1)).total,
          0,
          'un gestor reasignado no puede seguir consultando avisos del caso',
        )
        await prisma.notificacion.createMany({
          data: Array.from({ length: 25 }, (_, i) => ({
            idUsuario: ajeno.id,
            idSiniestro: siniestro.id,
            mensaje: `Aviso ${i}`,
            leida: false,
            revisada: false,
            tipoNotificacion: 'CAMBIO_ESTADO',
            fechaCreacion: ahora,
          })),
        })
        const pagina1 = await avisos.listar(ajeno, 1),
          pagina2 = await avisos.listar(ajeno, 99)
        assert.equal(pagina1.items.length, 20)
        assert.equal(pagina2.items.length, 5)
        assert.equal(pagina2.pagina, 2)
        assert.equal(new Set([...pagina1.items, ...pagina2.items].map((n) => n.id)).size, 25)
      },
    ),
)

test(
  'E5-05 por HTTP: gestor solicita, solo administración cierra y se revalida el rol tras una espera',
  { timeout: 90_000 },
  (t) =>
    conBaseDeEstados(
      async ({
        prisma,
        ahora,
        servicio,
        admin,
        superadmin,
        otroAdmin,
        gestor,
        ajeno,
        estado,
        inicial,
        cierre,
        caso,
      }) => {
        const solicitud = await estado('Solicitud de cierre')
        // E5-05 por HTTP real: no alcanza con ocultar Cierre enviado en el selector.
        const actoresHTTP = { gestor, ajeno, admin, superadmin }
        let servicioHTTP = servicio
        const app = express()
        app.use(express.json(), cookieParser())
        app.use(
          '/api/siniestros',
          crearSiniestrosRouter({
            requerirSesion: crearRequerirSesion({
              duracionMs: 1000,
              validar: async (token) =>
                actoresHTTP[token] ? { usuario: actoresHTTP[token], renovada: false } : null,
            }),
            estados: {
              opciones: (...args) => servicioHTTP.opciones(...args),
              cambiar: (...args) => servicioHTTP.cambiar(...args),
            },
          }),
        )
        app.use(errorHandler)
        const server = app.listen(0, '127.0.0.1')
        await new Promise((ok) => server.once('listening', ok))
        t.after(() => {
          server.closeAllConnections()
          return new Promise((ok) => server.close(ok))
        })
        const pedir = (token, id, accion, body) =>
          fetch(`http://127.0.0.1:${server.address().port}/api/siniestros/${id}/${accion}`, {
            method: body ? 'PATCH' : 'GET',
            headers: {
              ...(token ? { cookie: `cova_sesion=${token}` } : {}),
              ...(body ? { 'content-type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
          })
        const cuerpo = (desde, hacia) => ({
          idEstadoAnterior: desde.id,
          idEstadoSiniestro: hacia.id,
        })
        const propioHTTP = await caso()
        const previoHTTP = await prisma.siniestro.findUniqueOrThrow({
          where: { id: propioHTTP.id },
        })
        assert.equal((await pedir(null, propioHTTP.id, 'estados')).status, 401)
        const catalogoHTTP = await pedir('gestor', propioHTTP.id, 'estados')
        assert.equal(catalogoHTTP.status, 200)
        const opcionesHTTP = opcionesCambioEstadoSchema.parse(await catalogoHTTP.json())
        assert.ok(opcionesHTTP.estados.some((e) => e.id === solicitud.id))
        assert.ok(opcionesHTTP.estados.every((e) => !e.esCierre))
        assert.equal((await pedir('ajeno', propioHTTP.id, 'estados')).status, 403)
        assert.equal(
          (await pedir('ajeno', propioHTTP.id, 'estado', cuerpo(inicial, solicitud))).status,
          403,
        )
        const cierreProhibido = await pedir(
          'gestor',
          propioHTTP.id,
          'estado',
          cuerpo(inicial, cierre),
        )
        assert.equal(cierreProhibido.status, 403)
        assert.match((await cierreProhibido.json()).error, /Solo un administrador/)
        assert.equal(
          (
            await pedir('gestor', propioHTTP.id, 'estado', {
              ...cuerpo(inicial, cierre),
              tipoUsuario: 'SUPER_ADMINISTRADOR',
            })
          ).status,
          400,
        )
        assert.deepEqual(
          await prisma.siniestro.findUniqueOrThrow({ where: { id: propioHTTP.id } }),
          previoHTTP,
        )
        assert.equal(
          await prisma.historialSiniestro.count({ where: { idSiniestro: propioHTTP.id } }),
          0,
        )
        assert.equal(await prisma.notificacion.count({ where: { idSiniestro: propioHTTP.id } }), 0)

        assert.equal(
          (await pedir('gestor', propioHTTP.id, 'estado', cuerpo(inicial, solicitud))).status,
          204,
        )
        const solicitadoHTTP = await prisma.siniestro.findUniqueOrThrow({
          where: { id: propioHTTP.id },
        })
        assert.equal(solicitadoHTTP.idEstadoSiniestro, solicitud.id)
        assert.equal(solicitadoHTTP.fechaCierre, null)
        const historialHTTP = await prisma.historialSiniestro.findFirstOrThrow({
          where: { idSiniestro: propioHTTP.id },
        })
        assert.equal(historialHTTP.idUsuario, gestor.id)
        assert.equal(historialHTTP.fechaEvento.toISOString(), ahora.toISOString())
        const notificacionesHTTP = await prisma.notificacion.findMany({
          where: { idSiniestro: propioHTTP.id },
          orderBy: { idUsuario: 'asc' },
        })
        assert.deepEqual(
          notificacionesHTTP.map((n) => n.idUsuario),
          [admin.id, superadmin.id, otroAdmin.id].sort((a, b) => a - b),
        )
        assert.ok(notificacionesHTTP.every((n) => !n.leida && n.mensaje.includes(solicitud.nombre)))
        assert.equal(
          (await pedir('gestor', propioHTTP.id, 'estado', cuerpo(solicitud, solicitud))).status,
          409,
        )
        assert.equal(await prisma.notificacion.count({ where: { idSiniestro: propioHTTP.id } }), 3)
        assert.equal(
          (await pedir('admin', propioHTTP.id, 'estado', cuerpo(solicitud, cierre))).status,
          204,
        )
        assert.equal(
          (await pedir('gestor', propioHTTP.id, 'estado', cuerpo(cierre, inicial))).status,
          409,
        )
        assert.equal((await pedir('gestor', propioHTTP.id, 'estados')).status, 409)
        const otroCierreHTTP = await caso()
        assert.equal(
          (await pedir('superadmin', otroCierreHTTP.id, 'estado', cuerpo(inicial, cierre))).status,
          204,
        )

        // Si se degrada al administrador mientras espera el bloqueo, su sesión vieja no permite cerrar.
        const pendiente = await caso({ idUsuario: admin.id })
        let avisarPausa, liberarPausa
        let pausas = 0
        const pausado = new Promise((ok) => {
          avisarPausa = ok
        })
        const continuar = new Promise((ok) => {
          liberarPausa = ok
        })
        servicioHTTP = crearServicioEstadoSiniestro(
          {
            transaccion: (trabajo) =>
              prisma.$transaction(
                (tx) =>
                  trabajo(
                    new Proxy(tx, {
                      get(obj, clave) {
                        if (clave === '$queryRaw')
                          return async (partes, ...valores) => {
                            if (
                              partes.join('').includes('FROM "Siniestro"') &&
                              valores[0] === pendiente.id
                            ) {
                              pausas++
                              avisarPausa()
                              await continuar
                            }
                            return tx.$queryRaw(partes, ...valores)
                          }
                        return Reflect.get(obj, clave)
                      },
                    }),
                  ),
                { timeout: 15000 },
              ),
          },
          () => ahora,
        )
        const peticionPendiente = pedir('admin', pendiente.id, 'estado', cuerpo(inicial, cierre))
        let temporizadorPausa
        try {
          await Promise.race([
            pausado,
            new Promise((_, rechazar) => {
              temporizadorPausa = setTimeout(
                () =>
                  rechazar(
                    new Error(
                      'No se alcanzó la pausa antes del bloqueo del siniestro: revisá la consulta interceptada.',
                    ),
                  ),
                3000,
              )
            }),
          ])
          assert.equal(pausas, 1, 'la petición realmente pasó por la pausa de concurrencia')
          await prisma.usuario.update({ where: { id: admin.id }, data: { tipoUsuario: 'GESTOR' } })
        } finally {
          clearTimeout(temporizadorPausa)
          liberarPausa()
        }
        assert.equal((await peticionPendiente).status, 403)
        assert.equal(pausas, 1, 'no se debe omitir ni repetir la pausa de concurrencia')
        const trasRechazo = await prisma.siniestro.findUniqueOrThrow({
          where: { id: pendiente.id },
        })
        assert.equal(trasRechazo.idEstadoSiniestro, inicial.id)
        assert.equal(trasRechazo.fechaCierre, null)
        assert.equal(
          await prisma.historialSiniestro.count({ where: { idSiniestro: pendiente.id } }),
          0,
        )
        assert.equal(await prisma.notificacion.count({ where: { idSiniestro: pendiente.id } }), 0)
        await prisma.usuario.update({
          where: { id: admin.id },
          data: { tipoUsuario: 'ADMINISTRADOR' },
        })
      },
    ),
)
