import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'
import { dashboardAdministradorSchema } from '@cova/shared/schemas/dashboard'
import { filtrosSiniestrosSchema } from '@cova/shared/schemas/siniestros'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioDashboardAdministrador } from '../src/modules/dashboard/dashboard-administrador.service.ts'
import { crearServicioSiniestros } from '../src/modules/siniestros/siniestros.service.ts'

test(
  'PostgreSQL aislado: dashboard administrativo y ficha con responsable obligatorio',
  { timeout: 60_000 },
  async () => {
    const original = process.env.DATABASE_URL
    assert.ok(original, 'Hace falta DATABASE_URL con permiso local CREATEDB')
    const conexion = new URL(original)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(conexion.hostname))
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
      const servicio = crearServicioDashboardAdministrador(
        {
          lectura: (trabajo) => prisma.$transaction(trabajo, { isolationLevel: 'RepeatableRead' }),
        },
        () => ahora,
      )
      const usuario = async (nombres, tipoUsuario) =>
        prisma.usuario.create({
          data: {
            nombres,
            apellidos: 'Prueba',
            tipoUsuario,
            documento: '0',
            telefono: '0',
            email: `${nombres}@example.invalid`,
            contrasena: '-',
            idDireccion: (await prisma.direccion.create({ data: {} })).id,
          },
        })
      const admin = await usuario('Admin', 'ADMINISTRADOR')
      const superadmin = await usuario('Super', 'SUPER_ADMINISTRADOR')
      const gestor = await usuario('Gestor', 'GESTOR')
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
      for (const bloque of ['demorados', 'actividad'])
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
      const demorados = []
      for (let i = 0; i < 30; i++)
        demorados.push(
          await caso({
            fechaAsignacion: hace(200 + i),
            fechaUltimoMovimiento: null,
            idUsuario: i % 2 ? admin.id : gestor.id,
          }),
        )
      const limite = await caso({ fechaUltimoMovimiento: hace(72) })
      const antes = await caso({ fechaUltimoMovimiento: new Date(hace(72).getTime() + 1) })
      await caso({ fechaUltimoMovimiento: hace(120), idEstadoSiniestro: cierre.id })
      const dadoBaja = await caso({ eliminado: true, fechaBaja: ahora })
      const borrando = await caso({ eliminacionEnCurso: true })
      const vehiculo = await prisma.vehiculo.create({
        data: { idSiniestro: demorados[29].id, dominio: 'AA123BB', rolAccidente: 'ASEGURADO' },
      })
      for (const eliminado of [true, false])
        await prisma.personaInvolucrada.create({
          data: {
            idSiniestro: demorados[29].id,
            idVehiculo: vehiculo.id,
            esPropietario: true,
            eliminado,
            nombreCompletoRazonSocial: eliminado ? 'Asegurado eliminado' : 'Héctor Balbuena',
            fechaBaja: eliminado ? ahora : null,
          },
        })
      const evento = (s, extra = {}) =>
        prisma.historialSiniestro.create({
          data: {
            idSiniestro: s.id,
            idUsuario: admin.id,
            tipoEvento: 'CAMBIO_ESTADO',
            descripcion: 'Movimiento de prueba',
            fechaEvento: hace(1),
            ...extra,
          },
        })
      for (let i = 0; i < 6; i++) await evento(demorados[i], { fechaEvento: hace(i) })
      await evento(dadoBaja)
      await evento(borrando)
      await evento(demorados[0], { eliminado: true, fechaBaja: ahora })
      const resumen = await servicio.obtener(admin, { pagina: 1 })
      dashboardAdministradorSchema.parse(resumen)
      assert.equal(resumen.totalSiniestros, 33)
      assert.equal(resumen.estados.find((e) => e.id === abierto.id).cantidad, 32)
      assert.equal(resumen.estados.find((e) => e.id === cierre.id).cantidad, 1)
      assert.equal(resumen.estados.find((e) => e.id === sinCasos.id).cantidad, 0)
      assert.equal(resumen.demorados.total, 31)
      assert.equal(resumen.demorados.items.length, 5)
      assert.deepEqual(
        resumen.demorados.items.map((s) => s.id),
        demorados
          .slice(-5)
          .reverse()
          .map((s) => s.id),
      )
      assert.equal(resumen.demorados.items[0].asegurado, 'Héctor Balbuena')
      assert.equal(resumen.demorados.items[0].gestor.id, admin.id)
      assert.equal(resumen.actividad.total, 6)
      assert.equal(resumen.actividad.items.length, 5)
      assert.equal(resumen.actividad.items[0].siniestro.id, demorados[0].id)
      const todos = await servicio.obtener(superadmin, { ver: 'demorados', pagina: 1 })
      const segunda = await servicio.obtener(admin, { ver: 'demorados', pagina: 99 })
      assert.equal(todos.demorados.items.length, 25)
      assert.equal(segunda.demorados.pagina, 2)
      assert.equal(segunda.demorados.items.length, 6)
      assert.equal(segunda.demorados.items.at(-1).id, limite.id)
      assert.ok(!segunda.demorados.items.some((s) => s.id === antes.id))
      assert.equal(
        new Set([...todos.demorados.items, ...segunda.demorados.items].map((s) => s.id)).size,
        31,
      )
      assert.equal(
        (await servicio.obtener(admin, { ver: 'actividad', pagina: 1 })).actividad.items.length,
        6,
      )
      assert.ok(!('sinAsignar' in resumen))
      const [columna] =
        await prisma.$queryRaw`SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Siniestro' AND column_name = 'idUsuario'`
      assert.equal(columna.is_nullable, 'NO')
      const listado = crearServicioSiniestros(prisma, () => ahora)
      const ficha = await listado.obtener(admin, demorados[29].id)
      assert.equal(ficha.asignado.id, admin.id)
      assert.equal(
        (
          await listado.listar(admin, filtrosSiniestrosSchema.parse({ porPagina: '100' }))
        ).siniestros.find((s) => s.id === demorados[29].id).gestor.id,
        admin.id,
      )
      await assert.rejects(listado.obtener(gestor, demorados[29].id), { status: 403 })
    } finally {
      await disconnectPrisma()
      process.env.DATABASE_URL = original
      if (creada) await adminPg.query(`DROP DATABASE "${nombreBase}" WITH (FORCE)`)
      await adminPg.end()
    }
  },
)
