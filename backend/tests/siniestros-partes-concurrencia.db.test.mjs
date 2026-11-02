import assert from 'node:assert/strict'
import test from 'node:test'
import { agregarPersonaSchema } from '@cova/shared/schemas/partes-siniestro'
import { peritoAltaSchema, vehiculoAltaSchema } from '@cova/shared/schemas/siniestros-alta'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioPeritosGestion } from '../src/modules/siniestros/peritos/peritos-gestion.service.ts'
import { crearServicioPersonasGestion } from '../src/modules/siniestros/personas/personas-gestion.service.ts'
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
  const siniestro = await prisma.siniestro.create({
    data: {
      numeroSiniestro: `CONCURRENCIA-${marca}`,
      numeroPoliza: 'P',
      fechaAsignacion: new Date(),
      fechaUltimoMovimiento: new Date(),
      demorado: false,
      menorEdadInvolucrado: false,
      idEstadoSiniestro: estado.id,
      idAseguradora: aseguradora.id,
      idUsuario: gestora.id,
    },
  })
  const yo = { ...gestora, tipoUsuario: gestora.tipoUsuario }
  const idSiniestro = siniestro.id

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
  } finally {
    await prisma.historialSiniestro.deleteMany({ where: { idSiniestro } })
    await prisma.perito.deleteMany({ where: { idSiniestro } })
    await prisma.personaInvolucrada.deleteMany({ where: { idSiniestro } })
    await prisma.vehiculo.deleteMany({ where: { idSiniestro } })
    await prisma.siniestro.delete({ where: { id: idSiniestro } })
    await prisma.usuario.delete({ where: { id: gestora.id } })
    await prisma.direccion.delete({ where: { id: direccion.id } })
    await prisma.aseguradora.delete({ where: { id: aseguradora.id } })
    await disconnectPrisma()
  }
})
