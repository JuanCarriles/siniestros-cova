import assert from 'node:assert/strict'
import test from 'node:test'
import { dashboardGestorSchema } from '@cova/shared/schemas/dashboard'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioDashboard } from '../src/modules/dashboard/dashboard.service.ts'

test('PostgreSQL: dashboard propio, límite exacto de 72 h, pendientes y paginación, sin conservar datos de prueba', async () => {
  const prisma = getPrisma()
  const rollback = new Error('Revertir prueba dashboard')
  const ahora = new Date('2026-10-27T15:00:00.000Z')
  const hace = (horas) => new Date(ahora.getTime() - horas * 3_600_000)
  const marca = `dashboard-${Date.now()}`
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const servicio = crearServicioDashboard(
            { transaccion: (trabajo) => trabajo(tx) },
            () => ahora,
          )
          const abierto = await tx.estadoSiniestro.findFirstOrThrow({ where: { esCierre: false } })
          const cierre = await tx.estadoSiniestro.findFirstOrThrow({ where: { esCierre: true } })
          const aseguradora = await tx.aseguradora.create({ data: { nombre: marca } })
          const ajustador = await tx.ajustador.create({
            data: {
              nombres: 'A',
              apellidos: 'Prueba',
              telefono: '0',
              email: `${marca}@example.invalid`,
              idAseguradora: aseguradora.id,
            },
          })
          const crearUsuario = async (nombre) =>
            tx.usuario.create({
              data: {
                nombres: nombre,
                apellidos: 'Dashboard',
                documento: '0',
                telefono: '0',
                email: `${nombre}.${marca}@example.invalid`,
                contrasena: '-',
                tipoUsuario: 'GESTOR',
                idDireccion: (await tx.direccion.create({ data: {} })).id,
              },
            })
          const propio = await crearUsuario('propio')
          const ajeno = await crearUsuario('ajeno')
          const vacio = await crearUsuario('vacio')
          let numero = 0
          const caso = (extra = {}) =>
            tx.siniestro.create({
              data: {
                numeroSiniestro: `${marca}-${++numero}`,
                numeroPoliza: marca,
                fechaAsignacion: hace(200),
                fechaUltimoMovimiento: hace(1),
                demorado: false,
                menorEdadInvolucrado: false,
                idUsuario: propio.id,
                idEstadoSiniestro: abierto.id,
                idAseguradora: aseguradora.id,
                idAjustador: ajustador.id,
                ...extra,
              },
            })
          const reciente = await caso({ demorado: true }) // El flag persistido no define el cálculo.
          const limite = await caso({ fechaUltimoMovimiento: hace(72) })
          await caso({ fechaUltimoMovimiento: new Date(hace(72).getTime() + 1) })
          await caso({ fechaUltimoMovimiento: null, fechaAsignacion: hace(72) })
          await caso({ fechaUltimoMovimiento: null, fechaAsignacion: hace(2) })
          const extranjero = await caso({ idUsuario: ajeno.id, fechaUltimoMovimiento: hace(100) })
          const cerrado = await caso({ idEstadoSiniestro: cierre.id })
          const baja = await caso({ eliminado: true, fechaBaja: ahora })
          const borrando = await caso({ eliminacionEnCurso: true })
          const pericia = (idSiniestro, extra = {}) =>
            tx.perito.create({
              data: {
                idSiniestro,
                nombre: 'Perito de prueba',
                tipoPerito: 'CESVI',
                fechaSolicitud: hace(96),
                cerrado: false,
                ...extra,
              },
            })
          const primera = await pericia(limite.id, {
            fechaSolicitud: hace(240),
            tipoPerito: 'MEDICO',
          })
          for (let i = 0; i < 5; i++) await pericia(reciente.id, { fechaSolicitud: hace(120 - i) })
          for (const id of [extranjero.id, cerrado.id, baja.id, borrando.id]) await pericia(id)
          await pericia(reciente.id, { cerrado: true, fechaCierre: ahora })
          await pericia(reciente.id, { eliminado: true, fechaBaja: ahora })

          const resultado = await servicio.obtenerGestor(propio, 1)
          dashboardGestorSchema.parse(resultado)
          assert.deepEqual(resultado.casos, { activos: 5, alDia: 3, demorados: 2 })
          assert.equal(resultado.actualizadoEn, ahora.toISOString())
          assert.equal(resultado.periciasPendientes.total, 6)
          assert.equal(resultado.periciasPendientes.items.length, 5)
          assert.equal(resultado.periciasPendientes.items[0].id, primera.id)
          assert.equal(resultado.periciasPendientes.items[0].diasEspera, 10)
          assert.equal(resultado.periciasPendientes.items[0].siniestro.aseguradora, marca)
          const segunda = await servicio.obtenerGestor(propio, 999)
          assert.equal(segunda.periciasPendientes.pagina, 2)
          assert.equal(segunda.periciasPendientes.items.length, 1)
          assert.ok(
            !resultado.periciasPendientes.items.some(
              (p) => p.id === segunda.periciasPendientes.items[0].id,
            ),
          )
          const delOtro = await servicio.obtenerGestor(ajeno, 1)
          assert.deepEqual(delOtro.casos, { activos: 1, alDia: 0, demorados: 1 })
          assert.equal(delOtro.periciasPendientes.total, 1)
          assert.equal(delOtro.periciasPendientes.items[0].siniestro.id, extranjero.id)
          const sinCasos = await servicio.obtenerGestor(vacio, 8)
          assert.deepEqual(sinCasos.casos, { activos: 0, alDia: 0, demorados: 0 })
          assert.deepEqual(sinCasos.periciasPendientes, {
            total: 0,
            pagina: 1,
            porPagina: 5,
            items: [],
          })
          throw rollback
        },
        { isolationLevel: 'RepeatableRead', timeout: 20_000 },
      ),
      (error) => error === rollback,
    )
    assert.equal(await prisma.aseguradora.count({ where: { nombre: marca } }), 0)
  } finally {
    await disconnectPrisma()
  }
})
