import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import pg from 'pg'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioDashboardAdministrador } from '../src/modules/dashboard/dashboard-administrador.service.ts'
import { crearServicioBajasSiniestros } from '../src/modules/siniestros/siniestros-bajas.service.ts'
import { dashboardAdministradorSchema } from '@cova/shared/schemas/dashboard'

test(
  'dashboard: migra historial existente y conserva actividad tras fallos, reintentos y borrado definitivo',
  { timeout: 90000 },
  async () => {
    const original = process.env.DATABASE_URL,
      url = new URL(original)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    const nombre = `cova_test_actividad_${Date.now()}_${process.pid}`
    const control = new pg.Client({ connectionString: original, connectionTimeoutMillis: 4000 })
    await control.connect()
    let creada = false,
      sql
    try {
      await control.query(`CREATE DATABASE "${nombre}"`)
      creada = true
      url.pathname = `/${nombre}`
      process.env.DATABASE_URL = url.href
      sql = new pg.Client({ connectionString: url.href })
      await sql.connect()
      const carpeta = new URL('../prisma/migrations/', import.meta.url),
        nueva = '20261112200000_actividad_dashboard_persistente'
      for (const m of (await readdir(carpeta, { withFileTypes: true }))
        .filter((d) => d.isDirectory() && d.name < nueva)
        .map((d) => d.name)
        .sort())
        await sql.query(await readFile(new URL(`${m}/migration.sql`, carpeta), 'utf8'))
      const db = getPrisma()
      const actor = await db.usuario.create({
        data: {
          nombres: 'Admin',
          apellidos: 'Histórico',
          documento: '0',
          telefono: '0',
          email: 'actividad@example.invalid',
          contrasena: '-',
          tipoUsuario: 'ADMINISTRADOR',
          direccion: { create: {} },
        },
      })
      const aseguradora = await db.aseguradora.create({ data: { nombre: 'Prueba actividad' } })
      const estado = await db.estadoSiniestro.create({
        data: { nombre: 'Final', descripcion: 'Cerrado', esCierre: true },
      })
      const crearCaso = (numeroSiniestro) =>
        db.siniestro.create({
          data: {
            numeroSiniestro,
            numeroPoliza: 'P',
            fechaAsignacion: new Date('2026-10-01T12:00:00Z'),
            idEstadoSiniestro: estado.id,
            idAseguradora: aseguradora.id,
            idUsuario: actor.id,
            menorEdadInvolucrado: false,
          },
        })
      const caso = await crearCaso('AUD-1'),
        otro = await crearCaso('AUD-2')
      const eventoAnterior = await db.historialSiniestro.create({
        data: {
          idSiniestro: caso.id,
          idUsuario: actor.id,
          tipoEvento: 'NOVEDAD',
          descripcion: 'Una novedad anterior a la migración',
          fechaEvento: new Date('2026-10-02T12:00:00Z'),
        },
      })
      await db.historialSiniestro.create({
        data: {
          idSiniestro: caso.id,
          idUsuario: actor.id,
          tipoEvento: 'MENSAJE',
          descripcion: 'No visible',
          eliminado: true,
          fechaBaja: new Date(),
        },
      })
      const antesCaso = await db.siniestro.findUniqueOrThrow({ where: { id: caso.id } })
      await sql.query(await readFile(new URL(`${nueva}/migration.sql`, carpeta), 'utf8'))
      assert.deepEqual(
        await db.siniestro.findUniqueOrThrow({ where: { id: caso.id } }),
        antesCaso,
        'la migración no cambia el expediente',
      )
      assert.equal(await db.actividadSiniestro.count(), 1, 'solo copia eventos visibles existentes')
      const copia = await db.actividadSiniestro.findUniqueOrThrow({
        where: { idHistorial: eventoAnterior.id },
      })
      assert.equal(copia.autorNombre, 'Admin Histórico')
      assert.equal(copia.fechaEvento.toISOString(), eventoAnterior.fechaEvento.toISOString())
      await db.usuario.update({
        where: { id: actor.id },
        data: { nombres: 'Nombre nuevo', tipoUsuario: 'SUPER_ADMINISTRADOR' },
      })
      const ahora = new Date('2026-11-12T18:00:00Z')
      const dashboard = crearServicioDashboardAdministrador(
        { lectura: (trabajo) => db.$transaction(trabajo, { isolationLevel: 'RepeatableRead' }) },
        () => ahora,
      )
      const consultar = () => dashboard.obtener(actor, { ver: 'actividad', pagina: 1 })
      const eventos = [
        'ALTA_SINIESTRO',
        'ASIGNACION',
        'REASIGNACION',
        'CAMBIO_ESTADO',
        'DOCUMENTO',
        'NOVEDAD',
        'MENSAJE',
        'VEHICULO',
        'PERSONA',
        'ABOGADO',
        'PERITO',
        'MODIFICACION_DATOS',
      ]
      for (let i = 0; i < 30; i++)
        await db.historialSiniestro.create({
          data: {
            idSiniestro: caso.id,
            idUsuario: actor.id,
            tipoEvento: eventos[i % eventos.length],
            descripcion: `Movimiento ${i}`,
            fechaEvento: new Date(ahora.getTime() - 60000),
          },
        })
      await db.historialSiniestro.create({
        data: {
          idSiniestro: otro.id,
          idUsuario: actor.id,
          tipoEvento: 'NOVEDAD',
          descripcion: 'Otro expediente',
          fechaEvento: ahora,
        },
      })
      const previo = await consultar()
      dashboardAdministradorSchema.parse(previo)
      assert.equal(previo.actividad.total, 32)
      const segunda = await dashboard.obtener(actor, { ver: 'actividad', pagina: 2 })
      assert.equal(previo.actividad.items.length, 25)
      assert.equal(segunda.actividad.items.length, 7)
      const idsPrevios = [...previo.actividad.items, ...segunda.actividad.items].map((e) => e.id)
      assert.equal(new Set(idsPrevios).size, 32)
      assert.equal(segunda.actividad.items.find((e) => e.id === copia.id).autor, 'Admin Histórico')
      assert.equal(
        (await db.actividadSiniestro.findUniqueOrThrow({ where: { id: copia.id } }))
          .autorTipoUsuario,
        'ADMINISTRADOR',
      )
      let fallaR2 = true,
        fallaFinal = false
      const borrados = []
      const operaciones = crearServicioBajasSiniestros({
        base: {
          transaccion: (trabajo) =>
            db.$transaction(async (tx) => {
              const resultado = await trabajo(tx)
              if (fallaFinal && !(await tx.siniestro.findUnique({ where: { id: caso.id } })))
                throw Error('Rollback final controlado')
              return resultado
            }),
        },
        almacenamiento: () => ({
          eliminar: async (clave) => {
            if (fallaR2) throw Error('R2 no disponible')
            borrados.push(clave)
          },
        }),
        reloj: () => ahora,
      })
      const clave = `siniestros/${caso.id}/prueba.pdf`
      await db.documentoSiniestro.create({
        data: {
          idSiniestro: caso.id,
          idUsuario: actor.id,
          nombreOriginal: 'prueba.pdf',
          tipoExtension: 'pdf',
          mimeType: 'application/pdf',
          tamanoBytes: 10n,
          urlArchivoSinDominio: clave,
        },
      })
      await operaciones.darDeBaja(actor, caso.id)
      const conBaja = await consultar()
      assert.equal(conBaja.actividad.total, 33)
      assert.equal(
        conBaja.actividad.items.find((e) => e.siniestro.id === caso.id).siniestro.disponible,
        true,
        'un expediente dado de baja sigue disponible a administración',
      )
      const confirmar = { numeroSiniestro: caso.numeroSiniestro }
      await assert.rejects(operaciones.eliminar(actor, caso.id, confirmar), { status: 503 })
      const enProceso = await consultar()
      assert.equal(
        enProceso.actividad.total,
        conBaja.actividad.total,
        'el proceso de borrado no oculta actividades',
      )
      assert.equal(
        enProceso.actividad.items.find((e) => e.siniestro.id === caso.id).siniestro.disponible,
        false,
      )
      assert.equal(
        await db.actividadSiniestro.count({ where: { tipoEvento: 'ELIMINACION_SINIESTRO' } }),
        0,
      )
      fallaR2 = false
      fallaFinal = true
      await assert.rejects(
        operaciones.eliminar(actor, caso.id, confirmar),
        /Rollback final controlado/,
      )
      assert.ok(await db.siniestro.findUnique({ where: { id: caso.id } }))
      assert.equal(await db.historialSiniestro.count({ where: { idSiniestro: caso.id } }), 33)
      assert.equal(
        await db.actividadSiniestro.count({ where: { tipoEvento: 'ELIMINACION_SINIESTRO' } }),
        0,
        'no anuncia una eliminación revertida',
      )
      fallaFinal = false
      await Promise.all([
        operaciones.eliminar(actor, caso.id, confirmar),
        operaciones.eliminar(actor, caso.id, confirmar),
      ])
      assert.equal(await db.siniestro.findUnique({ where: { id: caso.id } }), null)
      assert.equal(
        await db.historialSiniestro.count({ where: { idSiniestro: caso.id } }),
        0,
        'el historial particular sí se elimina',
      )
      assert.ok(borrados.includes(clave), 'mantiene el borrado del archivo de R2')
      const final = await consultar(),
        finalSegunda = await dashboard.obtener(actor, { ver: 'actividad', pagina: 2 })
      dashboardAdministradorSchema.parse(final)
      assert.equal(final.actividad.total, conBaja.actividad.total + 1)
      const todos = [...final.actividad.items, ...finalSegunda.actividad.items]
      for (const id of idsPrevios)
        assert.ok(
          todos.some((e) => e.id === id),
          'conserva cada evento anterior',
        )
      for (const e of todos.filter((e) => e.siniestro.id === caso.id))
        assert.equal(e.siniestro.disponible, false)
      assert.equal(todos.find((e) => e.siniestro.id === otro.id).siniestro.disponible, true)
      const eliminacion = await db.actividadSiniestro.findFirstOrThrow({
        where: { tipoEvento: 'ELIMINACION_SINIESTRO' },
      })
      assert.equal(eliminacion.autorNombre, 'Nombre nuevo Histórico')
      assert.equal(eliminacion.autorTipoUsuario, 'SUPER_ADMINISTRADOR')
      assert.equal(eliminacion.fechaEvento.toISOString(), ahora.toISOString())
      assert.equal(eliminacion.idSiniestro, null)
      assert.equal(eliminacion.idSiniestroReferencia, caso.id)
      assert.match(eliminacion.descripcion, /eliminó definitivamente el siniestro AUD-1/)
      const fila = await db.actividadSiniestro.findUniqueOrThrow({ where: { id: copia.id } })
      assert.equal(fila.descripcion, copia.descripcion)
      assert.equal(fila.autorNombre, copia.autorNombre)
      assert.equal(fila.fechaEvento.toISOString(), copia.fechaEvento.toISOString())
      await operaciones.eliminar(actor, caso.id, confirmar)
      assert.equal(
        await db.actividadSiniestro.count({ where: { tipoEvento: 'ELIMINACION_SINIESTRO' } }),
        1,
      )
    } finally {
      await disconnectPrisma()
      await sql?.end()
      process.env.DATABASE_URL = original
      if (creada) await control.query(`DROP DATABASE "${nombre}" WITH (FORCE)`)
      await control.end()
    }
  },
)
