import assert from 'node:assert/strict'
import test from 'node:test'
import { agregarPersonaSchema } from '@cova/shared/schemas/partes-siniestro'
import { peritoAltaSchema, vehiculoAltaSchema } from '@cova/shared/schemas/siniestros-alta'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioAbogadosGestion } from '../src/modules/siniestros/abogados/abogados-gestion.service.ts'
import { crearServicioPeritosGestion } from '../src/modules/siniestros/peritos/peritos-gestion.service.ts'
import { crearServicioPersonasGestion } from '../src/modules/siniestros/personas/personas-gestion.service.ts'
import { crearServicioBajasSiniestros } from '../src/modules/siniestros/siniestros-bajas.service.ts'
import { crearServicioVehiculosGestion } from '../src/modules/siniestros/vehiculos/vehiculos-gestion.service.ts'

// CU-10 1.c (E5-06): dos usuarios confirman a la vez sobre el mismo siniestro. Cada operación corre en su propia
// transacción, como en el servidor: no se puede revertir todo junto, así que lo creado se borra al final.
test('PostgreSQL: los cambios simultáneos en las partes de un siniestro no dejan repetidos ni huérfanos', async () => {
  const prisma = getPrisma()
  const marca = Date.now()
  const base = { transaccion: (trabajo) => prisma.$transaction(trabajo, { timeout: 15_000 }) }
  const vehiculos = crearServicioVehiculosGestion(base)
  const personas = crearServicioPersonasGestion(base)
  const peritos = crearServicioPeritosGestion(base)
  const abogados = crearServicioAbogadosGestion(base)

  const estado = await prisma.estadoSiniestro.findFirstOrThrow({ where: { esCierre: false } })
  const aseguradora = await prisma.aseguradora.create({ data: { nombre: `Concurrencia ${marca}` } })
  const direccion = await prisma.direccion.create({ data: {} })
  const gestora = await prisma.usuario.create({
    data: {
      nombres: 'Ana',
      apellidos: 'Prueba',
      documento: '0',
      telefono: '0',
      email: `ana.concurrencia.${marca}@example.invalid`,
      contrasena: '-',
      tipoUsuario: 'GESTOR',
      idDireccion: direccion.id,
    },
  })
  const administradora = await prisma.usuario.create({
    data: {
      nombres: 'Eva',
      apellidos: 'Prueba',
      documento: '0',
      telefono: '0',
      email: `eva.concurrencia.${marca}@example.invalid`,
      contrasena: '-',
      tipoUsuario: 'ADMINISTRADOR',
      idDireccion: direccion.id,
    },
  })
  const crearSiniestro = (numero) =>
    prisma.siniestro.create({
      data: {
        numeroSiniestro: numero,
        numeroPoliza: 'P',
        fechaAsignacion: new Date(),
        fechaUltimoMovimiento: new Date(),
        menorEdadInvolucrado: false,
        idEstadoSiniestro: estado.id,
        idAseguradora: aseguradora.id,
        idUsuario: gestora.id,
      },
    })
  const siniestro = await crearSiniestro(`CONCURRENCIA-${marca}`)
  const otro = await crearSiniestro(`CONCURRENCIA-OTRO-${marca}`)
  const yo = { ...gestora, tipoUsuario: gestora.tipoUsuario }
  const idSiniestro = siniestro.id
  let idAbogado = null

  const vehiculo = (dominio) =>
    vehiculoAltaSchema.parse({
      rolAccidente: 'TERCERO',
      marca: '',
      modelo: '',
      version: '',
      dominio,
      numeroChasis: '',
      numeroMotor: '',
      anio: '',
      uso: '',
      tipo: '',
      color: '',
      idAseguradora: '',
      acreedorPrendario: '',
      descripcionDanos: '',
    })
  const persona = (tipo, idVehiculo, extra = {}) =>
    agregarPersonaSchema.parse({
      tipo,
      idVehiculo,
      datos: {
        nombreCompletoRazonSocial: '',
        idTipoDocumento: '',
        documento: '',
        estadoCivil: '',
        sexo: '',
        fechaNacimiento: '',
        telefono: '',
        email: '',
        domicilio: { idProvincia: '', localidad: '', calle: '', codigoPostal: '' },
        conLesiones: false,
        tipoLesion: '',
        descripcionLesiones: '',
        numeroPermisoConducir: '',
        fechaVencimientoCarnet: '',
        ...(tipo === 'titular'
          ? { ibaEnVehiculo: false, lugar: '', lugarOtro: '' }
          : { lugar: 'Acompañante', lugarOtro: '', relacionPropietario: '' }),
        ...extra,
      },
    })
  /** De dos operaciones a la vez, una sale bien y la otra se rechaza con un error que el formulario muestra */
  const unaSola = (resultados, estado) => {
    const bien = resultados.filter((r) => r.status === 'fulfilled')
    const mal = resultados.filter((r) => r.status === 'rejected')
    assert.equal(bien.length, 1, 'solo una de las dos operaciones se guarda')
    assert.equal(mal[0].reason.status, estado, String(mal[0].reason))
  }

  try {
    // El mismo dominio dos veces (escrito distinto)
    unaSola(
      await Promise.allSettled([
        vehiculos.agregar(yo, idSiniestro, vehiculo('AE 123 CD')),
        vehiculos.agregar(yo, idSiniestro, vehiculo('ae123cd')),
      ]),
      409,
    )
    assert.equal(await prisma.vehiculo.count({ where: { idSiniestro, eliminado: false } }), 1)

    // Dos titulares para el mismo vehículo
    const { id: idVehiculo } = await prisma.vehiculo.findFirstOrThrow({
      where: { idSiniestro, eliminado: false },
    })
    unaSola(
      await Promise.allSettled([
        personas.agregar(
          yo,
          idSiniestro,
          persona('titular', idVehiculo, { nombreCompletoRazonSocial: 'Uno' }),
        ),
        personas.agregar(
          yo,
          idSiniestro,
          persona('titular', idVehiculo, { nombreCompletoRazonSocial: 'Dos' }),
        ),
      ]),
      409,
    )
    assert.equal(
      await prisma.personaInvolucrada.count({
        where: { idVehiculo, esPropietario: true, eliminado: false },
      }),
      1,
    )

    // Dar de baja un vehículo mientras se le agrega un ocupante: o se agrega y la baja se frena, o se da de baja y
    // el ocupante no se carga. Nunca las dos.
    const { id: sinPersonas } = await vehiculos.agregar(yo, idSiniestro, vehiculo('AA 456 EF'))
    const resultados = await Promise.allSettled([
      vehiculos.darDeBaja(yo, idSiniestro, sinPersonas),
      personas.agregar(yo, idSiniestro, persona('ocupante', sinPersonas)),
    ])
    assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1)
    assert.ok(
      resultados.every((r) => r.status === 'fulfilled' || [404, 409].includes(r.reason.status)),
    )
    assert.equal(
      await prisma.personaInvolucrada.count({
        where: { idVehiculo: sinPersonas, eliminado: false, vehiculo: { eliminado: true } },
      }),
      0,
      'ninguna persona activa queda en un vehículo dado de baja',
    )

    // Dos peritos CESVI a la vez (E5-07): uno de cada tipo
    const perito = (nombre) =>
      peritoAltaSchema.parse({
        tipoPerito: 'CESVI',
        nombre,
        telefono: '',
        email: '',
        fechaSolicitud: '2026-10-01',
        fechaCierre: '',
      })
    unaSola(
      await Promise.allSettled([
        peritos.agregar(yo, idSiniestro, perito('Uno')),
        peritos.agregar(yo, idSiniestro, perito('Dos')),
      ]),
      409,
    )
    assert.equal(
      await prisma.perito.count({ where: { idSiniestro, tipoPerito: 'CESVI', eliminado: false } }),
      1,
    )

    // Un abogado en dos siniestros, dado de baja desde las dos fichas a la vez (E5-07): cada baja bloquea un
    // siniestro distinto. La que llega segunda tiene que ver que la otra ya le quitó sus personas y darlo de baja.
    ;({ id: idAbogado } = await prisma.abogado.create({
      data: { nombreCompleto: 'Luis Compartido' },
    }))
    for (const id of [idSiniestro, otro.id])
      await prisma.personaInvolucrada.create({
        data: { idSiniestro: id, nombreCompletoRazonSocial: 'Representada', idAbogado },
      })
    const bajas = await Promise.allSettled([
      abogados.darDeBaja(yo, idSiniestro, idAbogado),
      abogados.darDeBaja(yo, otro.id, idAbogado),
    ])
    assert.ok(
      bajas.every((r) => r.status === 'fulfilled'),
      String(bajas.find((r) => r.status === 'rejected')?.reason),
    )
    assert.equal(await prisma.personaInvolucrada.count({ where: { idAbogado } }), 0)
    assert.equal(
      (await prisma.abogado.findUniqueOrThrow({ where: { id: idAbogado } })).eliminado,
      true,
      'no queda activo un abogado que ya no representa a nadie',
    )

    // La baja del siniestro mientras se agrega un perito: la operación ya pasó el control de acceso y espera el
    // bloqueo. Cuando la baja se confirma, el perito no se carga en un siniestro dado de baja.
    let confirmarBaja
    const pausa = new Promise((resolver) => (confirmarBaja = resolver))
    const siniestros = crearServicioBajasSiniestros({
      base: {
        transaccion: (trabajo) =>
          prisma.$transaction(
            async (tx) => {
              const resultado = await trabajo(tx)
              await pausa
              return resultado
            },
            { timeout: 15_000 },
          ),
      },
      almacenamiento: () => ({ eliminar: async () => {} }),
    })
    const baja = siniestros.darDeBaja({ ...administradora }, idSiniestro)
    // La baja ya tiene el siniestro bloqueado y el cambio hecho, sin confirmar
    await esperar(prisma, `state = 'idle in transaction'`)
    const alta = peritos.agregar(yo, idSiniestro, { ...perito('Médico'), tipoPerito: 'MEDICO' })
    await esperar(prisma, `wait_event_type = 'Lock'`)
    confirmarBaja()
    await baja
    await assert.rejects(alta, (e) => e.status === 409 && /dado de baja/.test(e.message))
    assert.equal(
      await prisma.perito.count({ where: { idSiniestro, tipoPerito: 'MEDICO' } }),
      0,
      'no se carga un perito en un siniestro dado de baja',
    )
  } finally {
    for (const id of [idSiniestro, otro.id]) {
      await prisma.historialSiniestro.deleteMany({ where: { idSiniestro: id } })
      await prisma.perito.deleteMany({ where: { idSiniestro: id } })
      await prisma.personaInvolucrada.deleteMany({ where: { idSiniestro: id } })
      await prisma.vehiculo.deleteMany({ where: { idSiniestro: id } })
      await prisma.siniestro.delete({ where: { id } })
    }
    if (idAbogado) await prisma.abogado.delete({ where: { id: idAbogado } })
    await prisma.usuario.delete({ where: { id: administradora.id } })
    await prisma.usuario.delete({ where: { id: gestora.id } })
    await prisma.direccion.delete({ where: { id: direccion.id } })
    await prisma.aseguradora.delete({ where: { id: aseguradora.id } })
    await disconnectPrisma()
  }
})

/** Espera a que alguna conexión a esta base esté en la situación pedida (ver pg_stat_activity) */
async function esperar(prisma, condicion) {
  for (let intento = 0; intento < 250; intento++) {
    const [{ cantidad }] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS cantidad FROM pg_stat_activity WHERE datname = current_database() AND ${condicion}`,
    )
    if (cantidad > 0) return
    await new Promise((resolver) => setTimeout(resolver, 20))
  }
  throw new Error(`Ninguna conexión llegó a: ${condicion}`)
}
