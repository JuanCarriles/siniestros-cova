import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'
import { dashboardAdministradorSchema } from '@cova/shared/schemas/dashboard'
import { filtrosSiniestrosSchema } from '@cova/shared/schemas/siniestros'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioDashboardAdministrador } from '../src/modules/dashboard/dashboard-administrador.service.ts'
import { baseDashboardAdministrador } from '../src/modules/dashboard/dashboard.module.ts'
import { crearServicioDashboard } from '../src/modules/dashboard/dashboard.service.ts'
import { crearServicioSiniestros } from '../src/modules/siniestros/siniestros.service.ts'
import { crearServicioBajasSiniestros } from '../src/modules/siniestros/siniestros-bajas.service.ts'

test(
  'PostgreSQL aislado: totales, orden, paginación, casos sin gestor y asignación segura',
  { timeout: 60_000 },
  async () => {
    // Crea y elimina únicamente una base con nombre propio generado aquí. Nunca resetea la base del proyecto.
    const original = process.env.DATABASE_URL
    assert.ok(original, 'Hace falta DATABASE_URL con permiso local CREATEDB')
    const conexion = new URL(original)
    assert.ok(
      ['localhost', '127.0.0.1', '[::1]'].includes(conexion.hostname),
      'La prueba requiere PostgreSQL local',
    )
    const nombreBase = `cova_test_dashboard_${Date.now()}_${process.pid}`
    assert.match(nombreBase, /^cova_test_dashboard_\d+_\d+$/)
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
      const ahora = new Date('2026-10-28T15:00:00Z')
      const hace = (horas) => new Date(ahora.getTime() - horas * 3_600_000)
      const servicio = crearServicioDashboardAdministrador(baseDashboardAdministrador, () => ahora)
      const usuario = async (nombres, tipoUsuario = 'GESTOR', eliminado = false) =>
        prisma.usuario.create({
          data: {
            nombres,
            apellidos: 'Prueba',
            tipoUsuario,
            eliminado,
            fechaBaja: eliminado ? ahora : null,
            documento: '0',
            telefono: '0',
            email: `${nombres}@example.invalid`,
            contrasena: '-',
            idDireccion: (await prisma.direccion.create({ data: {} })).id,
          },
        })
      const admin = await usuario('Admin', 'ADMINISTRADOR')
      const superadmin = await usuario('Super', 'SUPER_ADMINISTRADOR')
      const gestor = await usuario('Gestor')
      const segundo = await usuario('Segundo')
      const bajaGestor = await usuario('Baja', 'GESTOR', true)
      const abierto = await prisma.estadoSiniestro.create({
        data: { nombre: 'Asignado', descripcion: 'Abierto' },
      })
      const cierre = await prisma.estadoSiniestro.create({
        data: { nombre: 'Cierre enviado', descripcion: 'Final', esCierre: true },
      })
      const sinCasos = await prisma.estadoSiniestro.create({
        data: { nombre: 'En pericia', descripcion: 'Sin casos' },
      })
      const aseguradora = await prisma.aseguradora.create({ data: { nombre: 'Prueba' } })
      const vacio = await servicio.obtener(admin, { pagina: 1 })
      assert.equal(vacio.totalSiniestros, 0)
      for (const bloque of ['demorados', 'sinAsignar', 'actividad'])
        assert.deepEqual(vacio[bloque], { total: 0, pagina: 1, porPagina: 5, items: [] })
      let numero = 0
      const caso = (extra = {}) =>
        prisma.siniestro.create({
          data: {
            numeroSiniestro: `DASH-${++numero}`,
            numeroPoliza: 'POL',
            idEstadoSiniestro: abierto.id,
            idAseguradora: aseguradora.id,
            idUsuario: gestor.id,
            fechaAsignacion: hace(300),
            fechaUltimoMovimiento: hace(1),
            demorado: false,
            menorEdadInvolucrado: false,
            ...extra,
          },
        })
      const pendientes = []
      for (let i = 0; i < 6; i++)
        pendientes.push(
          await caso({
            idUsuario: null,
            fechaAsignacion: hace(200 + i),
            fechaUltimoMovimiento: null,
          }),
        )
      const limite = await caso({ fechaUltimoMovimiento: hace(72) })
      const antes = await caso({ fechaUltimoMovimiento: new Date(hace(72).getTime() + 1) })
      await caso({
        fechaUltimoMovimiento: hace(120),
        idEstadoSiniestro: cierre.id,
        idUsuario: null,
      })
      const dadoBaja = await caso({ eliminado: true, fechaBaja: ahora, idUsuario: null })
      const borrando = await caso({ eliminacionEnCurso: true, idUsuario: null })
      const evento = (siniestro, extra = {}) =>
        prisma.historialSiniestro.create({
          data: {
            idSiniestro: siniestro.id,
            idUsuario: admin.id,
            tipoEvento: 'CAMBIO_ESTADO',
            descripcion: 'Movimiento de prueba',
            fechaEvento: hace(1),
            ...extra,
          },
        })
      for (let i = 0; i < 6; i++) await evento(pendientes[i], { fechaEvento: hace(i) })
      await evento(dadoBaja)
      await evento(borrando)
      await evento(pendientes[0], { eliminado: true, fechaBaja: ahora })
      const vehiculoAsegurado = await prisma.vehiculo.create({
        data: { dominio: 'AA123BB', rolAccidente: 'ASEGURADO' },
      })
      await prisma.personaInvolucrada.create({
        data: {
          idSiniestro: pendientes[5].id,
          idVehiculo: vehiculoAsegurado.id,
          esPropietario: true,
          nombreCompletoRazonSocial: 'Asegurado eliminado',
          eliminado: true,
          fechaBaja: ahora,
        },
      })
      await prisma.personaInvolucrada.create({
        data: {
          idSiniestro: pendientes[5].id,
          idVehiculo: vehiculoAsegurado.id,
          esPropietario: true,
          nombreCompletoRazonSocial: 'Héctor Balbuena',
        },
      })
      const resumen = await servicio.obtener(admin, { pagina: 1 })
      dashboardAdministradorSchema.parse(resumen)
      assert.equal(resumen.sinAsignar.items[0].asegurado, 'Héctor Balbuena')
      assert.equal(resumen.demorados.items[0].asegurado, 'Héctor Balbuena')
      assert.equal(resumen.sinAsignar.items[1].asegurado, null)
      assert.equal(resumen.totalSiniestros, 9)
      assert.equal(resumen.estados.find((e) => e.id === abierto.id).cantidad, 8)
      assert.equal(resumen.estados.find((e) => e.id === cierre.id).cantidad, 1)
      assert.equal(resumen.estados.find((e) => e.id === sinCasos.id).cantidad, 0)
      assert.equal(resumen.demorados.total, 7)
      assert.equal(resumen.sinAsignar.total, 6)
      assert.deepEqual(
        resumen.sinAsignar.items.map((s) => s.id),
        pendientes
          .slice(1)
          .reverse()
          .map((s) => s.id),
      )
      assert.deepEqual(
        resumen.demorados.items.map((s) => s.id),
        resumen.sinAsignar.items.map((s) => s.id),
      )
      assert.equal(resumen.actividad.total, 6)
      assert.equal(resumen.actividad.items.length, 5)
      assert.equal(resumen.actividad.items[0].siniestro.id, pendientes[0].id)
      const todos = await servicio.obtener(superadmin, { ver: 'demorados', pagina: 99 })
      assert.equal(todos.demorados.porPagina, 25)
      assert.equal(todos.demorados.pagina, 1)
      assert.equal(todos.demorados.items.at(-1).id, limite.id)
      assert.ok(!todos.demorados.items.some((s) => s.id === antes.id))
      assert.equal(
        (await servicio.obtener(admin, { ver: 'actividad', pagina: 1 })).actividad.items.length,
        6,
      )
      assert.deepEqual(
        (await servicio.gestores(admin)).map((g) => g.id).sort(),
        [gestor.id, segundo.id].sort(),
      )
      // Paginación real de más de una página: los casos recientes no alteran el orden de los urgentes.
      for (let i = 0; i < 30; i++)
        await caso({ idUsuario: null, fechaAsignacion: hace(1), fechaUltimoMovimiento: null })
      const paginaDos = await servicio.obtener(admin, { ver: 'sin-asignar', pagina: 99 })
      assert.equal(paginaDos.sinAsignar.total, 36)
      assert.equal(paginaDos.sinAsignar.pagina, 2)
      assert.equal(paginaDos.sinAsignar.items.length, 11)
      assert.equal(new Set(paginaDos.sinAsignar.items.map((s) => s.id)).size, 11)
      const listado = crearServicioSiniestros(prisma, () => ahora)
      assert.equal((await listado.obtener(admin, pendientes[0].id)).gestor, null)
      assert.equal(
        (
          await listado.listar(admin, filtrosSiniestrosSchema.parse({ porPagina: '100' }))
        ).siniestros.find((s) => s.id === pendientes[0].id).gestor,
        null,
      )
      await assert.rejects(listado.obtener(gestor, pendientes[0].id), { status: 403 })
      await assert.rejects(servicio.asignar(gestor, pendientes[0].id, gestor.id), { status: 403 })
      await assert.rejects(servicio.asignar(admin, pendientes[0].id, bajaGestor.id), {
        status: 409,
      })
      await assert.rejects(servicio.asignar(admin, pendientes[0].id, admin.id), { status: 409 })
      await assert.rejects(servicio.asignar(admin, dadoBaja.id, gestor.id), { status: 409 })
      await assert.rejects(servicio.asignar(admin, borrando.id, gestor.id), { status: 409 })
      await servicio.asignar(admin, pendientes[0].id, gestor.id)
      const asignado = await prisma.siniestro.findUniqueOrThrow({ where: { id: pendientes[0].id } })
      assert.equal(asignado.idUsuario, gestor.id)
      assert.equal(asignado.fechaUltimoMovimiento.toISOString(), ahora.toISOString())
      assert.equal(
        asignado.fechaAsignacion.toISOString(),
        pendientes[0].fechaAsignacion.toISOString(),
      )
      const historial = await prisma.historialSiniestro.findFirstOrThrow({
        where: { idSiniestro: asignado.id, tipoEvento: 'ASIGNACION' },
      })
      assert.equal(historial.idUsuario, admin.id)
      assert.match(historial.descripcion, /Gestor Prueba/)
      assert.equal(
        await prisma.notificacion.count({
          where: {
            idSiniestro: asignado.id,
            idUsuario: gestor.id,
            tipoNotificacion: 'ASIGNACION_SINIESTRO',
          },
        }),
        1,
      )
      await assert.rejects(servicio.asignar(superadmin, asignado.id, segundo.id), { status: 409 })
      assert.equal(
        await prisma.historialSiniestro.count({
          where: { idSiniestro: asignado.id, tipoEvento: 'ASIGNACION' },
        }),
        1,
      )
      assert.equal((await servicio.obtener(admin, { pagina: 1 })).sinAsignar.total, 35)
      assert.equal((await listado.obtener(gestor, asignado.id)).gestor.id, gestor.id)
      const delGestor = await crearServicioDashboard(
        { transaccion: (trabajo) => prisma.$transaction(trabajo) },
        () => ahora,
      ).obtenerGestor(gestor, 1)
      assert.deepEqual(delGestor.casos, { activos: 3, alDia: 2, demorados: 1 })
      // Dos administradores compiten por el mismo expediente: uno gana y el otro recibe 409.
      const competencia = await Promise.allSettled([
        servicio.asignar(admin, pendientes[1].id, gestor.id),
        servicio.asignar(superadmin, pendientes[1].id, segundo.id),
      ])
      assert.equal(competencia.filter((r) => r.status === 'fulfilled').length, 1)
      assert.equal(
        competencia.find((r) => r.status === 'rejected').reason.status,
        409,
        JSON.stringify(competencia.find((r) => r.status === 'rejected').reason),
      )
      assert.equal(
        await prisma.historialSiniestro.count({
          where: { idSiniestro: pendientes[1].id, tipoEvento: 'ASIGNACION' },
        }),
        1,
      )
      assert.equal(
        await prisma.notificacion.count({
          where: { idSiniestro: pendientes[1].id, tipoNotificacion: 'ASIGNACION_SINIESTRO' },
        }),
        1,
      )
      // La reactivación de un caso sin gestor sigue siendo válida.
      const bajas = crearServicioBajasSiniestros({
        base: { transaccion: (trabajo) => prisma.$transaction(trabajo) },
        almacenamiento: () => {
          throw new Error('No usar R2')
        },
      })
      await bajas.reactivar(admin, dadoBaja.id)
      assert.equal(
        (await prisma.siniestro.findUniqueOrThrow({ where: { id: dadoBaja.id } })).idUsuario,
        null,
      )
      const ajustadorBaja = await prisma.ajustador.create({
        data: {
          nombres: 'Ajustador',
          apellidos: 'Baja',
          telefono: '0',
          email: 'ajustador@example.invalid',
          idAseguradora: aseguradora.id,
          eliminado: true,
          fechaBaja: ahora,
        },
      })
      const sinGestorConAjustadorBaja = await caso({
        idUsuario: null,
        idAjustador: ajustadorBaja.id,
        eliminado: true,
        fechaBaja: ahora,
      })
      await assert.rejects(bajas.reactivar(admin, sinGestorConAjustadorBaja.id), { status: 409 })
      await prisma.usuario.update({ where: { id: admin.id }, data: { tipoUsuario: 'GESTOR' } })
      await assert.rejects(servicio.asignar(admin, pendientes[2].id, segundo.id), { status: 403 })
    } finally {
      await disconnectPrisma()
      process.env.DATABASE_URL = original
      if (creada) await adminPg.query(`DROP DATABASE "${nombreBase}" WITH (FORCE)`)
      await adminPg.end()
    }
  },
)
