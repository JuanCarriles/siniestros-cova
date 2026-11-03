import assert from 'node:assert/strict'
import test from 'node:test'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearTareaDemoras } from '../src/modules/siniestros/demoras.service.ts'
import { registrarMovimiento } from '../src/modules/siniestros/partes-edicion.ts'
import { crearServicioBajasSiniestros } from '../src/modules/siniestros/siniestros-bajas.service.ts'

const DIA = 86_400_000
const AHORA = new Date('2026-11-10T15:00:00Z')
const hace = (dias, desde = AHORA) => new Date(desde.getTime() - dias * DIA)

// RF-19 (E5-10): la tarea programada que avisa de los casos demorados, y qué cuenta como movimiento
test('PostgreSQL: avisos de casos demorados a las 72 horas y a los 7 días', async () => {
  const prisma = getPrisma()
  const rollback = new Error('Fin de prueba: revertir los datos')
  const marca = Date.now()
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const abierto = await tx.estadoSiniestro.findFirstOrThrow({ where: { esCierre: false } })
          const cierre = await tx.estadoSiniestro.findFirstOrThrow({ where: { esCierre: true } })
          const aseguradora = await tx.aseguradora.create({ data: { nombre: `Demoras ${marca}` } })
          const usuario = async (nombres, tipoUsuario, eliminado = false) =>
            tx.usuario.create({
              data: {
                nombres,
                apellidos: 'Prueba',
                documento: '0',
                telefono: '0',
                email: `${nombres.toLowerCase()}.demoras.${marca}@example.invalid`,
                contrasena: '-',
                tipoUsuario,
                eliminado,
                fechaBaja: eliminado ? AHORA : null,
                idDireccion: (await tx.direccion.create({ data: {} })).id,
              },
            })
          const gestora = await usuario('Ana', 'GESTOR')
          const gestorDeBaja = await usuario('Bruno', 'GESTOR', true)
          const admin = await usuario('Carla', 'ADMINISTRADOR')
          const adminDeBaja = await usuario('Dario', 'ADMINISTRADOR', true)
          const caso = (numero, extra = {}) =>
            tx.siniestro.create({
              data: {
                numeroSiniestro: `${numero}-${marca}`,
                numeroPoliza: 'P',
                fechaAsignacion: hace(30),
                menorEdadInvolucrado: false,
                idEstadoSiniestro: abierto.id,
                idAseguradora: aseguradora.id,
                idUsuario: gestora.id,
                ...extra,
              },
            })
          const demorado = await caso('DEMORADO', { fechaUltimoMovimiento: hace(4) })
          const alDia = await caso('AL-DIA', { fechaUltimoMovimiento: hace(2) })
          const limite = await caso('LIMITE', { fechaUltimoMovimiento: hace(3) })
          const enAlerta = await caso('ALERTA', { fechaUltimoMovimiento: hace(8) })
          const cerrado = await caso('CERRADO', {
            fechaUltimoMovimiento: hace(10),
            idEstadoSiniestro: cierre.id,
          })
          const deBaja = await caso('BAJA', {
            fechaUltimoMovimiento: hace(10),
            eliminado: true,
            fechaBaja: hace(9),
          })
          const sinMovimientos = await caso('SIN-MOV', {
            fechaAsignacion: hace(5),
            fechaUltimoMovimiento: null,
            idUsuario: gestorDeBaja.id,
          })
          const nuestros = [demorado, alDia, limite, enAlerta, cerrado, deBaja, sinMovimientos]
          const administracion = (
            await tx.usuario.findMany({
              where: {
                eliminado: false,
                tipoUsuario: { in: ['ADMINISTRADOR', 'SUPER_ADMINISTRADOR'] },
              },
              select: { id: true },
            })
          ).map((u) => u.id)
          assert.ok(administracion.includes(admin.id) && !administracion.includes(adminDeBaja.id))

          let reloj = AHORA
          const tarea = crearTareaDemoras({
            transaccion: (trabajo) => trabajo(tx),
            reloj: () => reloj,
          })
          const avisos = async () =>
            tx.notificacion.findMany({
              where: { idSiniestro: { in: nuestros.map((s) => s.id) } },
              orderBy: { id: 'asc' },
              select: {
                idSiniestro: true,
                idUsuario: true,
                tipoNotificacion: true,
                mensaje: true,
                fechaCreacion: true,
              },
            })
          /** Por caso: [tipo, destinatarios ordenados] de los avisos creados en `cuando` */
          const resumen = (lista, cuando) => {
            const porCaso = new Map()
            for (const n of lista.filter((n) => n.fechaCreacion.getTime() === cuando.getTime())) {
              const clave = `${n.idSiniestro}:${n.tipoNotificacion}`
              porCaso.set(
                clave,
                [...(porCaso.get(clave) ?? []), n.idUsuario].sort((a, b) => a - b),
              )
            }
            return Object.fromEntries(porCaso)
          }
          const conAsignada = [...new Set([gestora.id, ...administracion])].sort((a, b) => a - b)
          const soloAdministracion = [...administracion].sort((a, b) => a - b)

          // Primera vuelta: 72 horas justas ya es demorado; 8 días va directo a alerta; cerrado, dado de baja y al
          // día no avisan. Sin movimientos cuenta desde la asignación; su asignado está de baja: solo administración.
          assert.deepEqual((await tarea.revisar()).revisado, true)
          const primera = await avisos()
          assert.deepEqual(resumen(primera, AHORA), {
            [`${demorado.id}:CASO_DEMORADO`]: conAsignada,
            [`${limite.id}:CASO_DEMORADO`]: conAsignada,
            [`${enAlerta.id}:CASO_EN_ALERTA`]: conAsignada,
            [`${sinMovimientos.id}:CASO_DEMORADO`]: soloAdministracion,
          })
          const mensaje = (s) => primera.find((n) => n.idSiniestro === s.id).mensaje
          assert.equal(
            mensaje(demorado),
            `El siniestro DEMORADO-${marca} está demorado: lleva 4 días sin movimiento (último movimiento el 06/11/2026).`,
          )
          assert.equal(
            mensaje(enAlerta),
            `El siniestro ALERTA-${marca} lleva 8 días sin movimiento (último movimiento el 02/11/2026): está en alerta.`,
          )
          assert.equal(
            mensaje(sinMovimientos),
            `El siniestro SIN-MOV-${marca} está demorado: lleva 5 días sin movimiento (sin movimientos desde la asignación, el 05/11/2026).`,
          )

          // Otra vuelta más tarde, sin cambios: no repite
          reloj = new Date(AHORA.getTime() + 3_600_000)
          await tarea.revisar()
          assert.equal((await avisos()).length, primera.length)

          // A los 7 días, el demorado pasa a alerta (un aviso más); el que ya estaba en alerta no se repite
          reloj = new Date(AHORA.getTime() + 3 * DIA)
          await tarea.revisar()
          const segunda = resumen(await avisos(), reloj)
          assert.deepEqual(segunda[`${demorado.id}:CASO_EN_ALERTA`], conAsignada)
          assert.equal(segunda[`${enAlerta.id}:CASO_EN_ALERTA`], undefined)

          // Si el caso se mueve, vuelve a empezar: a las 72 horas del movimiento, otro aviso de demora
          await registrarMovimiento(tx, demorado.id, reloj)
          const movido = reloj
          reloj = new Date(movido.getTime() + 2 * DIA)
          await tarea.revisar()
          assert.equal(resumen(await avisos(), reloj)[`${demorado.id}:CASO_DEMORADO`], undefined)
          reloj = new Date(movido.getTime() + 3 * DIA)
          await tarea.revisar()
          assert.deepEqual(
            resumen(await avisos(), reloj)[`${demorado.id}:CASO_DEMORADO`],
            conAsignada,
          )

          // La baja del siniestro no es movimiento; reactivarlo sí (el tiempo dado de baja no cuenta como demora)
          const bajas = crearServicioBajasSiniestros({
            base: { transaccion: (trabajo) => trabajo(tx) },
            almacenamiento: () => ({ eliminar: async () => {} }),
            reloj: () => AHORA,
          })
          const sesionAdmin = { ...admin, tipoUsuario: 'ADMINISTRADOR' }
          const movimientoDe = async (s) =>
            (await tx.siniestro.findUniqueOrThrow({ where: { id: s.id } })).fechaUltimoMovimiento
          await bajas.darDeBaja(sesionAdmin, alDia.id)
          assert.equal((await movimientoDe(alDia)).toISOString(), hace(2).toISOString())
          await bajas.reactivar(sesionAdmin, alDia.id)
          assert.equal((await movimientoDe(alDia)).toISOString(), AHORA.toISOString())
          throw rollback
        },
        { timeout: 30_000 },
      ),
      (error) => error === rollback,
    )
  } finally {
    await disconnectPrisma()
  }
})

// Si dos procesos corren la tarea a la vez (dos instancias del backend), solo uno revisa
test('PostgreSQL: la tarea de demoras no corre dos veces a la vez', async () => {
  const prisma = getPrisma()
  const tarea = crearTareaDemoras({
    transaccion: (trabajo) => prisma.$transaction(trabajo, { timeout: 30_000 }),
    // Una fecha muy vieja: no hay casos demorados para ella, así que la prueba no crea avisos
    reloj: () => new Date('2000-01-01T00:00:00Z'),
  })
  let soltar
  let fallo = null
  const ocupada = prisma
    .$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(51010)`
        await new Promise((resolver) => (soltar = resolver))
      },
      { timeout: 30_000 },
    )
    .catch((error) => {
      fallo = error
    })
  try {
    while (!soltar && !fallo) await new Promise((r) => setTimeout(r, 10))
    if (fallo) throw fallo
    assert.deepEqual(await tarea.revisar(), { revisado: false, casos: 0, avisos: 0 })
    soltar()
    await ocupada
    assert.deepEqual(await tarea.revisar(), { revisado: true, casos: 0, avisos: 0 })
  } finally {
    soltar?.()
    await ocupada
    await disconnectPrisma()
  }
})
