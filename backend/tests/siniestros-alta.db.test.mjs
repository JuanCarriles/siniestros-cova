import assert from 'node:assert/strict'
import test from 'node:test'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioAltaSiniestros } from '../src/modules/siniestros/siniestros-alta.service.ts'

const conCampo = (status, campo) => (error) =>
  error.status === status && error.details?.campo === campo

test('PostgreSQL: alta paso 1 (E4-04): opciones activas y número duplicado por aseguradora', async () => {
  const prisma = getPrisma()
  const rollback = new Error('Fin de prueba: revertir los datos')
  const marca = Date.now()
  try {
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        const alta = crearServicioAltaSiniestros(tx)
        const abierto = await tx.estadoSiniestro.findFirstOrThrow({ where: { esCierre: false } })
        const cierre = await tx.estadoSiniestro.findFirstOrThrow({ where: { esCierre: true } })
        const aseguradora = await tx.aseguradora.create({ data: { nombre: `Alta A ${marca}` } })
        const otra = await tx.aseguradora.create({ data: { nombre: `Alta B ${marca}` } })
        const deBaja = await tx.aseguradora.create({
          data: { nombre: `Alta C ${marca}`, eliminado: true, fechaBaja: new Date() },
        })
        const ajustador = (nombres, idAseguradora, extra = {}) =>
          tx.ajustador.create({
            data: {
              nombres,
              apellidos: `Prueba ${marca}`,
              email: `${nombres}.${marca}@example.invalid`,
              telefono: '0',
              idAseguradora,
              ...extra,
            },
          })
        const ricardo = await ajustador('Ricardo', aseguradora.id)
        const deOtra = await ajustador('Diego', otra.id)
        await ajustador('Baja', aseguradora.id, { eliminado: true, fechaBaja: new Date() })
        const gestor = await tx.usuario.create({
          data: {
            nombres: 'Ana',
            apellidos: 'Prueba',
            documento: '0',
            telefono: '0',
            email: `ana.${marca}@example.invalid`,
            contrasena: '-',
            tipoUsuario: 'GESTOR',
            idDireccion: (await tx.direccion.create({ data: {} })).id,
          },
        })
        const siniestro = (numeroSiniestro, extra = {}) =>
          tx.siniestro.create({
            data: {
              numeroSiniestro,
              numeroPoliza: 'P',
              fechaAsignacion: new Date(),
              demorado: false,
              menorEdadInvolucrado: false,
              idEstadoSiniestro: abierto.id,
              idAseguradora: aseguradora.id,
              idUsuario: gestor.id,
              idAjustador: ricardo.id,
              ...extra,
            },
          })
        await siniestro(`ALTA-${marca}`)
        await siniestro(`BAJA-${marca}`, { eliminado: true, fechaBaja: new Date() })
        // Cerrado: no cuenta como caso activo del ajustador
        await siniestro(`CERRADO-${marca}`, { idEstadoSiniestro: cierre.id })

        const opciones = await alta.opciones()
        const ids = (lista) => lista.map((x) => x.id)
        assert.ok(ids(opciones.aseguradoras).includes(aseguradora.id))
        assert.ok(!ids(opciones.aseguradoras).includes(deBaja.id), 'sin aseguradoras de baja')
        const delCaso = opciones.ajustadores.filter((a) => a.idAseguradora === aseguradora.id)
        assert.deepEqual(delCaso, [
          {
            id: ricardo.id,
            nombre: `Ricardo Prueba ${marca}`,
            idAseguradora: aseguradora.id,
            casosActivos: 1,
          },
        ])
        assert.ok(opciones.provincias.length > 0 && opciones.paises.length > 0)
        assert.ok(opciones.tiposDocumento.some((t) => t.nombre === 'DNI Tarjeta'))

        const datos = {
          numeroSiniestro: `NUEVO-${marca}`,
          numeroPoliza: 'P',
          inicioVigencia: null,
          idAseguradora: aseguradora.id,
          sucursal: 'Casa central',
          idAjustador: ricardo.id,
          fechaOcurrencia: null,
          horaOcurrencia: null,
          menorEdadInvolucrado: false,
          causa: null,
          lugar: {
            idProvincia: opciones.provincias[0].id,
            localidad: null,
            calle: null,
            codigoPostal: null,
          },
        }
        await alta.validarDatosCaso(datos)

        // CU-09 5.b: mismo número y aseguradora, sin distinguir mayúsculas; también si está dado de baja
        await assert.rejects(
          alta.validarDatosCaso({ ...datos, numeroSiniestro: `alta-${marca}` }),
          conCampo(409, 'numeroSiniestro'),
        )
        await assert.rejects(
          alta.validarDatosCaso({ ...datos, numeroSiniestro: `BAJA-${marca}` }),
          (error) => error.status === 409 && /dado de baja/.test(error.message),
        )
        // El mismo número en otra aseguradora es otro siniestro
        await alta.validarDatosCaso({
          ...datos,
          numeroSiniestro: `ALTA-${marca}`,
          idAseguradora: otra.id,
          idAjustador: deOtra.id,
        })

        await assert.rejects(
          alta.validarDatosCaso({ ...datos, idAseguradora: deBaja.id, idAjustador: null }),
          conCampo(400, 'idAseguradora'),
        )
        await assert.rejects(
          alta.validarDatosCaso({ ...datos, idAjustador: deOtra.id }),
          conCampo(400, 'idAjustador'),
        )
        await assert.rejects(
          alta.validarDatosCaso({ ...datos, lugar: { ...datos.lugar, idProvincia: 2147483647 } }),
          conCampo(400, 'lugar.idProvincia'),
        )
        throw rollback
      }),
      (error) => error === rollback,
    )
  } finally {
    await disconnectPrisma()
  }
})
