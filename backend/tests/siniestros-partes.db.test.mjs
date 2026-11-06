import assert from 'node:assert/strict'
import test from 'node:test'
import { agregarPersonaSchema } from '@cova/shared/schemas/partes-siniestro'
import { vehiculoAltaSchema } from '@cova/shared/schemas/siniestros-alta'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioPersonasGestion } from '../src/modules/siniestros/personas/personas-gestion.service.ts'
import { crearServicioVehiculosGestion } from '../src/modules/siniestros/vehiculos/vehiculos-gestion.service.ts'

// CU-10 1.c (E5-06): vehículos y personas desde la ficha, con las reglas del alta y todo en el historial
test('PostgreSQL: agregar, modificar y dar de baja vehículos y personas desde la ficha', async () => {
  const prisma = getPrisma()
  const rollback = new Error('Fin de prueba: revertir los datos')
  const marca = Date.now()
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const abierto = await tx.estadoSiniestro.findFirstOrThrow({ where: { esCierre: false } })
          const cierre = await tx.estadoSiniestro.findFirstOrThrow({ where: { esCierre: true } })
          const provincia = await tx.provincia.findFirstOrThrow({ where: { eliminado: false } })
          const tipoDni = await tx.tipoDocumento.findFirstOrThrow({ where: { eliminado: false } })
          const aseguradora = await tx.aseguradora.create({ data: { nombre: `Partes ${marca}` } })
          const usuario = async (nombres, tipoUsuario) =>
            tx.usuario.create({
              data: {
                nombres,
                apellidos: 'Prueba',
                documento: '0',
                telefono: '0',
                email: `${nombres.toLowerCase()}.${marca}@example.invalid`,
                contrasena: '-',
                tipoUsuario,
                idDireccion: (await tx.direccion.create({ data: {} })).id,
              },
            })
          const gestora = await usuario('Ana', 'GESTOR')
          const otro = await usuario('Beto', 'GESTOR')
          const admin = await usuario('Carla', 'ADMINISTRADOR')
          const sesion = (u) => ({ ...u, tipoUsuario: u.tipoUsuario })

          const ultimoMovimiento = new Date('2026-10-01T12:00:00Z')
          const siniestro = (numero, extra = {}) =>
            tx.siniestro.create({
              data: {
                numeroSiniestro: `${numero}-${marca}`,
                numeroPoliza: 'P',
                fechaAsignacion: new Date('2026-09-01T12:00:00Z'),
                fechaUltimoMovimiento: ultimoMovimiento,
                menorEdadInvolucrado: false,
                idEstadoSiniestro: abierto.id,
                idAseguradora: aseguradora.id,
                idUsuario: gestora.id,
                ...extra,
              },
            })
          const caso = await siniestro('PARTES')
          const cerrado = await siniestro('CERRADO', { idEstadoSiniestro: cierre.id })
          const deBaja = await siniestro('BAJA', { eliminado: true, fechaBaja: new Date() })

          const base = { transaccion: (trabajo) => trabajo(tx) }
          const vehiculos = crearServicioVehiculosGestion(base)
          const personas = crearServicioPersonasGestion(base)
          const yo = sesion(gestora)
          const historial = async () =>
            (
              await tx.historialSiniestro.findMany({
                where: { idSiniestro: caso.id },
                orderBy: { id: 'asc' },
                select: { tipoEvento: true, descripcion: true },
              })
            ).map((e) => [e.tipoEvento, e.descripcion.replace(/ el \d\d\/\d\d\/\d{4}$/, '')])

          const vehiculo = (extra = {}) =>
            vehiculoAltaSchema.parse({
              rolAccidente: 'TERCERO',
              marca: 'Fiat',
              modelo: 'Cronos',
              version: '',
              dominio: 'AE 123 CD',
              numeroChasis: '',
              numeroMotor: '',
              anio: '2021',
              uso: '',
              tipo: '',
              color: 'Gris',
              idAseguradora: String(aseguradora.id),
              acreedorPrendario: '',
              descripcionDanos: '',
              ...extra,
            })
          const persona = (extra = {}) => ({
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
            ...extra,
          })
          const permiso = { numeroPermisoConducir: '', fechaVencimientoCarnet: '' }
          const titular = (extra = {}) =>
            persona({
              ibaEnVehiculo: true,
              lugar: 'Conductor/a',
              lugarOtro: '',
              ...permiso,
              ...extra,
            })

          // Vehículo: se agrega y queda en el historial; el mismo dominio (sin espacios ni guiones) no
          const { id: idVehiculo } = await vehiculos.agregar(yo, caso.id, vehiculo())
          await assert.rejects(
            vehiculos.agregar(yo, caso.id, vehiculo({ dominio: 'ae123-cd' })),
            (e) => e.status === 409 && e.details?.campo === 'dominio',
          )

          // Titular: uno solo por vehículo
          const { id: idTitular } = await personas.agregar(
            yo,
            caso.id,
            agregarPersonaSchema.parse({
              tipo: 'titular',
              idVehiculo,
              datos: titular({
                nombreCompletoRazonSocial: 'Norma Quiroga',
                idTipoDocumento: String(tipoDni.id),
                documento: '27.884.102',
              }),
            }),
          )
          await assert.rejects(
            personas.agregar(
              yo,
              caso.id,
              agregarPersonaSchema.parse({ tipo: 'titular', idVehiculo, datos: titular() }),
            ),
            (e) => e.status === 409 && /ya tiene titular/.test(e.message),
          )
          // El mismo documento no puede estar en dos personas (sin contar puntos)
          const ocupante = (extra = {}) =>
            agregarPersonaSchema.parse({
              tipo: 'ocupante',
              idVehiculo,
              datos: persona({
                lugar: 'Acompañante',
                lugarOtro: '',
                relacionPropietario: 'Hijo',
                ...permiso,
                ...extra,
              }),
            })
          await assert.rejects(
            personas.agregar(yo, caso.id, ocupante({ documento: '27884102' })),
            (e) => e.status === 409 && e.details?.campo === 'documento',
          )
          const { id: idOcupante } = await personas.agregar(
            yo,
            caso.id,
            ocupante({ nombreCompletoRazonSocial: 'Martín Quiroga' }),
          )
          await personas.agregar(
            yo,
            caso.id,
            agregarPersonaSchema.parse({
              tipo: 'externa',
              datos: persona({ rolSinVehiculo: 'Testigo' }),
            }),
          )

          // Modificar: el historial nombra los campos que cambiaron; sin cambios no registra nada
          await vehiculos.modificar(yo, caso.id, idVehiculo, {
            revision: 0,
            datos: vehiculo({ color: 'Blanco', descripcionDanos: 'Paragolpes' }),
          })
          // Un formulario abierto antes del cambio, con lo mismo que quedó guardado: no pisa nada
          await vehiculos.modificar(yo, caso.id, idVehiculo, {
            revision: 0,
            datos: vehiculo({ color: 'Blanco', descripcionDanos: 'Paragolpes' }),
          })
          // Con algo distinto, se rechaza y no cambia nada: el otro usuario había cambiado el color
          await assert.rejects(
            vehiculos.modificar(yo, caso.id, idVehiculo, {
              revision: 0,
              datos: vehiculo({ marca: 'Peugeot' }),
            }),
            (e) =>
              e.status === 409 &&
              e.details?.codigo === 'REGISTRO_DESACTUALIZADO' &&
              e.details.revision === 1,
          )
          const vehiculoGuardado = await tx.vehiculo.findUniqueOrThrow({
            where: { id: idVehiculo },
          })
          assert.deepEqual(
            [vehiculoGuardado.marca, vehiculoGuardado.color, vehiculoGuardado.revision],
            ['Fiat', 'Blanco', 1],
          )
          const datosTitular = (domicilio) =>
            titular({
              nombreCompletoRazonSocial: 'Norma Quiroga',
              idTipoDocumento: String(tipoDni.id),
              documento: '27.884.102',
              telefono: '11 5520-8834',
              domicilio: {
                idProvincia: String(provincia.id),
                localidad: 'Rosario',
                calle: '',
                codigoPostal: '',
                ...domicilio,
              },
            })
          await personas.modificar(yo, caso.id, idTitular, { revision: 0, datos: datosTitular() })
          const titularGuardado = await tx.personaInvolucrada.findUniqueOrThrow({
            where: { id: idTitular },
            include: { direccion: true },
          })
          assert.equal(titularGuardado.telefono, '11 5520-8834')
          assert.equal(titularGuardado.direccion.localidad, 'Rosario')
          await assert.rejects(
            personas.modificar(yo, caso.id, idTitular, {
              revision: 0,
              datos: datosTitular({ localidad: 'Funes' }),
            }),
            (e) => e.status === 409 && e.details?.codigo === 'REGISTRO_DESACTUALIZADO',
          )

          // Una dirección que también usa otro registro no se corrige en su lugar: la persona pasa a tener una copia
          await tx.usuario.update({
            where: { id: gestora.id },
            data: { idDireccion: titularGuardado.idDireccion },
          })
          await personas.modificar(yo, caso.id, idTitular, {
            revision: 1,
            datos: datosTitular({ localidad: 'Funes' }),
          })
          const conCopia = await tx.personaInvolucrada.findUniqueOrThrow({
            where: { id: idTitular },
            include: { direccion: true },
          })
          assert.notEqual(conCopia.idDireccion, titularGuardado.idDireccion)
          assert.equal(conCopia.direccion.localidad, 'Funes')
          const deLaGestora = await tx.direccion.findUniqueOrThrow({
            where: { id: titularGuardado.idDireccion },
          })
          assert.equal(deLaGestora.localidad, 'Rosario')
          // Los datos de otro tipo de persona no se aceptan
          await assert.rejects(
            personas.modificar(yo, caso.id, idTitular, {
              revision: 2,
              datos: { rolSinVehiculo: 'Peatón' },
            }),
            { name: 'ZodError' },
          )

          // 1.c.6.1: con personas no se da de baja el vehículo; se dice a quiénes
          await assert.rejects(vehiculos.darDeBaja(yo, caso.id, idVehiculo), (e) => {
            assert.equal(e.status, 409)
            assert.deepEqual(
              e.details.personas.map((p) => [p.id, p.nombre, p.rol]),
              [
                [idTitular, 'Norma Quiroga', 'titular'],
                [idOcupante, 'Martín Quiroga', 'ocupante'],
              ],
            )
            return true
          })
          await personas.darDeBaja(yo, caso.id, idTitular)
          await personas.darDeBaja(yo, caso.id, idOcupante)
          await vehiculos.darDeBaja(yo, caso.id, idVehiculo)
          const dadoDeBaja = await tx.vehiculo.findUniqueOrThrow({ where: { id: idVehiculo } })
          assert.equal(dadoDeBaja.eliminado, true)
          assert.ok(dadoDeBaja.fechaBaja)
          // Uno dado de baja ya no ocupa su dominio
          await vehiculos.agregar(yo, caso.id, vehiculo())

          assert.deepEqual(await historial(), [
            ['VEHICULO', 'Ana Prueba agregó el vehículo AE 123 CD'],
            ['PERSONA', 'Ana Prueba agregó a Norma Quiroga como titular del vehículo AE 123 CD'],
            ['PERSONA', 'Ana Prueba agregó a Martín Quiroga como ocupante del vehículo AE 123 CD'],
            ['PERSONA', 'Ana Prueba agregó a una persona sin nombre como testigo'],
            ['VEHICULO', 'Ana Prueba modificó el vehículo AE 123 CD (color y daños)'],
            [
              'PERSONA',
              'Ana Prueba modificó los datos de Norma Quiroga, titular del vehículo AE 123 CD (teléfono y domicilio)',
            ],
            [
              'PERSONA',
              'Ana Prueba modificó los datos de Norma Quiroga, titular del vehículo AE 123 CD (domicilio)',
            ],
            ['PERSONA', 'Ana Prueba dio de baja a Norma Quiroga, titular del vehículo AE 123 CD,'],
            [
              'PERSONA',
              'Ana Prueba dio de baja a Martín Quiroga, ocupante del vehículo AE 123 CD,',
            ],
            ['VEHICULO', 'Ana Prueba dio de baja el vehículo AE 123 CD'],
            ['VEHICULO', 'Ana Prueba agregó el vehículo AE 123 CD'],
          ])

          // No cuenta como movimiento del caso
          const despues = await tx.siniestro.findUniqueOrThrow({ where: { id: caso.id } })
          assert.equal(despues.fechaUltimoMovimiento.toISOString(), ultimoMovimiento.toISOString())

          // Cerrado o dado de baja: solo lectura. Un gestor ajeno: sin permiso
          await assert.rejects(
            vehiculos.agregar(sesion(admin), cerrado.id, vehiculo()),
            (e) => e.status === 409 && /cerrado/.test(e.message),
          )
          await assert.rejects(
            vehiculos.agregar(sesion(admin), deBaja.id, vehiculo()),
            (e) => e.status === 409 && /dado de baja/.test(e.message),
          )
          await assert.rejects(
            vehiculos.agregar(sesion(otro), caso.id, vehiculo({ dominio: 'ZZ999ZZ' })),
            (e) => e.status === 403,
          )
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
