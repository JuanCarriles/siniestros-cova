import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioInformes } from '../src/modules/informes/informes.service.ts'
import { crearServicioEstadoSiniestro } from '../src/modules/siniestros/siniestros-estado.service.ts'
import { calcularInforme, mesArgentina } from '../src/modules/informes/informes.calculos.ts'

test(
  'Informe mensual: migración, triggers, permisos, PDF, R2 privado, reintentos y concurrencia',
  { timeout: 120000 },
  async (t) => {
    assert.notEqual(process.env.NODE_ENV, 'production')
    const original = process.env.DATABASE_URL
    assert.ok(original)
    const url = new URL(original)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    const admin = new pg.Client({ connectionString: original, connectionTimeoutMillis: 4000 })
    await admin.connect()
    const nombre = `cova_test_informes_${Date.now()}_${process.pid}`
    let creada = false
    try {
      await admin.query(`CREATE DATABASE "${nombre}"`)
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
      const db = getPrisma(),
        transaccion = (trabajo) => db.$transaction(trabajo)
      const u = (tipoUsuario) =>
        db.usuario.create({
          data: {
            nombres: tipoUsuario,
            apellidos: 'Prueba',
            documento: '0',
            telefono: '0',
            email: `${tipoUsuario}@example.invalid`,
            contrasena: '-',
            tipoUsuario,
            direccion: { create: {} },
          },
        })
      const superadmin = await u('SUPER_ADMINISTRADOR'),
        gestor = await u('GESTOR'),
        administrador = await u('ADMINISTRADOR')
      const abierto = await db.estadoSiniestro.create({
          data: { nombre: 'Tratamiento', descripcion: 'Abierto' },
        }),
        cierre = await db.estadoSiniestro.create({
          data: { nombre: 'Finalizado', descripcion: 'Final', esCierre: true },
        }),
        aseguradora = await db.aseguradora.create({ data: { nombre: 'Prueba informes' } })
      const caso = await db.siniestro.create({
        data: {
          numeroSiniestro: 'INF-1',
          numeroPoliza: 'P',
          fechaAsignacion: new Date(),
          menorEdadInvolucrado: false,
          idEstadoSiniestro: abierto.id,
          idUsuario: gestor.id,
          idAseguradora: aseguradora.id,
          montoReclamado: '100.10',
        },
      })
      const filas = () => db.registroEstadisticoSiniestro.findMany({ orderBy: { id: 'asc' } })
      await t.test(
        'No cambia datos existentes y registra altas, estados y autores en la misma transacción',
        async () => {
          assert.equal((await filas()).filter((r) => r.evento === 'ALTA').length, 1)
          const servicio = crearServicioEstadoSiniestro({ transaccion })
          await assert.rejects(
            servicio.cambiar(administrador, caso.id, {
              idEstadoAnterior: abierto.id,
              idEstadoSiniestro: cierre.id,
            }),
            (e) => e.status === 400,
          )
          await assert.rejects(
            servicio.cambiar(gestor, caso.id, {
              idEstadoAnterior: abierto.id,
              idEstadoSiniestro: cierre.id,
              cierre: { resultadoCierre: 'ACUERDO_PAGO', montoAcordado: '60.05' },
            }),
            (e) => e.status === 403,
          )
          await servicio.cambiar(administrador, caso.id, {
            idEstadoAnterior: abierto.id,
            idEstadoSiniestro: cierre.id,
            cierre: { resultadoCierre: 'ACUERDO_PAGO', montoAcordado: '60.05' },
          })
          const historial = await db.historialSiniestro.findMany({
            where: { idSiniestro: caso.id },
          })
          assert.equal(historial.length, 1)
          assert.equal((await filas()).filter((r) => r.evento === 'CAMBIO_ESTADO').length, 1)
          assert.equal(
            (
              await db.siniestro.findUniqueOrThrow({ where: { id: caso.id } })
            ).montoAcordado.toString(),
            '60.05',
          )
          const cantidad = (await filas()).length
          await assert.rejects(
            db.$transaction(async (tx) => {
              await tx.siniestro.update({ where: { id: caso.id }, data: { montoReclamado: '999' } })
              throw new Error('rollback')
            }),
          )
          assert.equal((await filas()).length, cantidad)
        },
      )
      let subidas = 0,
        enviados = 0,
        fallarCorreo = true
      const objetos = new Map()
      const almacenamiento = {
        subirInforme: async (k, pdf) => {
          subidas++
          assert.match(k, /^informes mensuales\/(?:pruebas\/)?\d{4}\/\d{2}\//)
          assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
          objetos.set(k, pdf)
        },
        leerInforme: async (k) => objetos.get(k),
        firmarDescarga: async (k, n, m) => ({
          url: 'https://example.invalid/firmada',
          venceEnSegundos: 300,
          venceEn: new Date().toISOString(),
          k,
          n,
          m,
        }),
        eliminar: async (k) => objetos.delete(k),
      }
      const servicio = crearServicioInformes({
        db: () => db,
        almacenamiento: () => almacenamiento,
        pruebasHabilitadas: true,
        enviar: async () => {
          enviados++
          if (fallarCorreo) throw new Error('correo simulado')
        },
      })
      let generado
      await t.test('Gestor no accede, administrador consulta, solo superadmin prueba', async () => {
        await assert.rejects(servicio.listar(gestor), (e) => e.status === 403)
        await assert.rejects(
          servicio.probar(administrador, mesArgentina(), false),
          (e) => e.status === 403,
        )
        generado = await servicio.probar(superadmin, mesArgentina(), false)
        assert.equal(subidas, 1)
        const lista = await servicio.listar(administrador)
        assert.equal(lista.informes[0].disponible, true)
        assert.equal(lista.pruebasHabilitadas, false)
        const firma = await servicio.descargar(superadmin, generado.id)
        assert.equal(firma.venceEnSegundos, 300)
        assert.equal(firma.m, 'application/pdf')
      })
      await t.test(
        'El fallo de mail conserva el PDF; reenvío no regenera ni duplica; no envía dos veces',
        async () => {
          await assert.rejects(servicio.reenviar(superadmin, generado.id), (e) => e.status === 502)
          assert.equal(
            (await db.informeMensual.findUniqueOrThrow({ where: { id: generado.id } })).estado,
            'LISTO',
          )
          fallarCorreo = false
          await servicio.reenviar(superadmin, generado.id)
          await servicio.reenviar(superadmin, generado.id)
          assert.equal(subidas, 1)
          assert.equal(enviados, 2)
          const guardado = await db.informeMensual.findUniqueOrThrow({ where: { id: generado.id } })
          assert.ok(guardado.correoEnviado)
          assert.ok(guardado.datos)
          await db.siniestro.update({ where: { id: caso.id }, data: { numeroPoliza: 'CAMBIADA' } })
          assert.deepEqual(
            (await db.informeMensual.findUniqueOrThrow({ where: { id: generado.id } })).datos,
            guardado.datos,
          )
        },
      )
      await t.test(
        'El borrado del expediente no borra el registro estadístico ni el PDF',
        async () => {
          await db.notificacion.deleteMany({ where: { idSiniestro: caso.id } })
          await db.historialSiniestro.deleteMany({ where: { idSiniestro: caso.id } })
          await db.siniestro.delete({ where: { id: caso.id } })
          const registros = await filas()
          assert.equal(registros.at(-1).evento, 'ELIMINACION')
          assert.ok(registros.some((r) => r.evento === 'CAMBIO_ESTADO'))
          assert.equal((await servicio.listar(superadmin)).informes.length, 1)
          assert.equal(
            calcularInforme(mesArgentina(), registros, new Date(Date.now() + 1000)).cerrados,
            1,
          )
        },
      )

      await t.test(
        'Día 1 a las 07:00 Argentina: ejecución concurrente única y recuperación de pendientes',
        async () => {
          const periodo = mesArgentina()
          const cierreMes = new Date(`${periodo}-01T03:00:00Z`)
          cierreMes.setUTCMonth(cierreMes.getUTCMonth() + 1)
          let reloj = new Date(cierreMes.getTime() + 6 * 3600000 + 59 * 60000)
          const auto = crearServicioInformes({
            db: () => db,
            almacenamiento: () => almacenamiento,
            pruebasHabilitadas: false,
            reloj: () => reloj,
            enviar: async () => {
              enviados++
            },
          })
          await assert.rejects(auto.probar(superadmin, periodo, false), (e) => e.status === 403)
          await auto.revisarPendientes()
          assert.equal(await db.informeMensual.count({ where: { prueba: false } }), 0)
          reloj = new Date(cierreMes.getTime() + 7 * 3600000)
          const resultados = await Promise.allSettled([
            auto.revisarPendientes(),
            auto.revisarPendientes(),
          ])
          assert.ok(resultados.some((r) => r.status === 'fulfilled'))
          assert.equal(
            await db.informeMensual.count({
              where: { clavePeriodo: periodo, prueba: false, estado: 'LISTO' },
            }),
            1,
          )
          const oficial = await db.informeMensual.findUniqueOrThrow({
            where: { clavePeriodo: periodo },
          })
          assert.ok(oficial.correoEnviado)
          assert.ok(!oficial.clavePdf.includes('/pruebas/'))
          const cantidadSubida = subidas
          await auto.revisarPendientes()
          assert.equal(subidas, cantidadSubida)
          // Reinicio simulado dos meses después: toma el primer período faltante, sin regenerar el anterior.
          reloj = new Date(cierreMes)
          reloj.setUTCMonth(reloj.getUTCMonth() + 2)
          reloj.setUTCHours(12)
          await auto.revisarPendientes()
          assert.equal(
            await db.informeMensual.count({ where: { prueba: false, estado: 'LISTO' } }),
            2,
          )
        },
      )
    } finally {
      await disconnectPrisma()
      process.env.DATABASE_URL = original
      if (creada) await admin.query(`DROP DATABASE "${nombre}" WITH (FORCE)`)
      await admin.end()
    }
  },
)
