import assert from 'node:assert/strict'
import test from 'node:test'
import { abogadoFichaSchema } from '@cova/shared/schemas/partes-siniestro'
import { peritoAltaSchema } from '@cova/shared/schemas/siniestros-alta'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioAbogadosGestion } from '../src/modules/siniestros/abogados/abogados-gestion.service.ts'
import { crearServicioPeritosGestion } from '../src/modules/siniestros/peritos/peritos-gestion.service.ts'

// CU-10 1.d y 1.e (E5-07): abogados y peritos desde la ficha, con las reglas del alta y todo en el historial
test('PostgreSQL: agregar, modificar y dar de baja abogados y peritos desde la ficha', async () => {
  const prisma = getPrisma()
  const rollback = new Error('Fin de prueba: revertir los datos')
  const marca = Date.now()
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const abierto = await tx.estadoSiniestro.findFirstOrThrow({ where: { esCierre: false } })
          const cierre = await tx.estadoSiniestro.findFirstOrThrow({ where: { esCierre: true } })
          const aseguradora = await tx.aseguradora.create({ data: { nombre: `Abogados ${marca}` } })
          const gestora = await tx.usuario.create({
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
          const yo = { ...gestora, tipoUsuario: gestora.tipoUsuario }

          const ultimoMovimiento = new Date('2026-10-01T12:00:00Z')
          const siniestro = (numero, extra = {}) =>
            tx.siniestro.create({
              data: {
                numeroSiniestro: `${numero}-${marca}`,
                numeroPoliza: 'P',
                fechaAsignacion: new Date('2026-09-01T12:00:00Z'),
                fechaUltimoMovimiento: ultimoMovimiento,
                demorado: false,
                menorEdadInvolucrado: false,
                idEstadoSiniestro: abierto.id,
                idAseguradora: aseguradora.id,
                idUsuario: gestora.id,
                ...extra,
              },
            })
          const caso = await siniestro('ABOGADOS')
          const otroCaso = await siniestro('OTRO')
          const cerrado = await siniestro('CERRADO', { idEstadoSiniestro: cierre.id })
          const persona = async (idSiniestro, nombre, idAbogado = null) =>
            (
              await tx.personaInvolucrada.create({
                data: { idSiniestro, nombreCompletoRazonSocial: nombre, idAbogado },
              })
            ).id
          const abogadoDe = async (id) =>
            (await tx.personaInvolucrada.findUniqueOrThrow({ where: { id } })).idAbogado
          const abogadoGuardado = (id) => tx.abogado.findUniqueOrThrow({ where: { id } })

          // Dos abogados que también figuran en otro siniestro (como en el seed)
          const valeria = await tx.abogado.create({
            data: { nombreCompleto: 'Valeria Quintana', telefono: '341 400-0001' },
          })
          const luis = await tx.abogado.create({ data: { nombreCompleto: 'Luis Maidana' } })
          const norma = await persona(caso.id, 'Norma Quiroga', valeria.id)
          const martin = await persona(caso.id, 'Martín Quiroga')
          const sinNombre = await persona(caso.id, null)
          const elsa = await persona(caso.id, 'Elsa Paz', luis.id)
          await persona(otroCaso.id, 'Rita Gómez', valeria.id)
          await persona(otroCaso.id, 'Hugo Gómez', luis.id)
          const ajena = await persona(otroCaso.id, 'Persona de otro caso')

          const base = { transaccion: (trabajo) => trabajo(tx) }
          const abogados = crearServicioAbogadosGestion(base)
          const peritos = crearServicioPeritosGestion(base)
          const historial = async () =>
            (
              await tx.historialSiniestro.findMany({
                where: { idSiniestro: caso.id },
                orderBy: { id: 'asc' },
                select: { tipoEvento: true, descripcion: true },
              })
            ).map((e) => [e.tipoEvento, e.descripcion.replace(/ el \d\d\/\d\d\/\d{4}$/, '')])
          const abogado = (extra = {}) =>
            abogadoFichaSchema.parse({
              nombreCompleto: 'Sofía Herrera',
              numeroMatricula: 'T° 45 F° 123',
              telefono: '',
              email: '',
              representados: [martin, sinNombre],
              ...extra,
            })

          // Agregar: representa a personas del siniestro; una de otro caso no se puede elegir
          await assert.rejects(
            abogados.agregar(yo, caso.id, abogado({ representados: [martin, ajena] })),
            (e) => e.status === 409 && e.details?.campo === 'representados',
          )
          const { id: sofia } = await abogados.agregar(yo, caso.id, abogado())
          assert.deepEqual([await abogadoDe(martin), await abogadoDe(sinNombre)], [sofia, sofia])

          // Modificar a quién representa: Norma deja a Valeria y pasa a Sofía; la persona sin nombre queda sin abogado
          await abogados.modificar(yo, caso.id, sofia, abogado({ representados: [martin, norma] }))
          assert.deepEqual(
            [await abogadoDe(martin), await abogadoDe(norma), await abogadoDe(sinNombre)],
            [sofia, sofia, null],
          )
          // Sin cambios no registra nada
          await abogados.modificar(yo, caso.id, sofia, abogado({ representados: [norma, martin] }))

          // Valeria ya no representa a nadie en este caso: no se puede tocar desde acá
          await assert.rejects(
            abogados.modificar(yo, caso.id, valeria.id, abogado({ representados: [norma] })),
            (e) => e.status === 404,
          )

          // Luis también figura en otro caso: cambiar su teléfono desde este crea una copia solo para este
          await abogados.modificar(
            yo,
            caso.id,
            luis.id,
            abogado({
              nombreCompleto: 'Luis Maidana',
              numeroMatricula: '',
              telefono: '11 5000-2000',
              representados: [elsa],
            }),
          )
          const copia = await abogadoDe(elsa)
          assert.notEqual(copia, luis.id)
          assert.equal((await abogadoGuardado(copia)).telefono, '11 5000-2000')
          assert.equal((await abogadoGuardado(luis.id)).telefono, null)

          // Baja: sus personas de este caso quedan sin abogado. Valeria sigue en el otro caso: no se da de baja
          await tx.personaInvolucrada.update({
            where: { id: sinNombre },
            data: { idAbogado: valeria.id },
          })
          await abogados.darDeBaja(yo, caso.id, valeria.id)
          assert.equal(await abogadoDe(sinNombre), null)
          assert.equal((await abogadoGuardado(valeria.id)).eliminado, false)
          // Sofía solo estaba en este: se da de baja
          await abogados.darDeBaja(yo, caso.id, sofia)
          assert.deepEqual([await abogadoDe(martin), await abogadoDe(norma)], [null, null])
          const bajaSofia = await abogadoGuardado(sofia)
          assert.equal(bajaSofia.eliminado, true)
          assert.ok(bajaSofia.fechaBaja)

          // Peritos: uno de cada tipo
          const perito = (extra = {}) =>
            peritoAltaSchema.parse({
              tipoPerito: 'CESVI',
              nombre: 'Jorge Benítez',
              telefono: '',
              email: '',
              fechaSolicitud: '2026-10-01',
              fechaCierre: '',
              ...extra,
            })
          const movimiento = async () =>
            (await tx.siniestro.findUniqueOrThrow({ where: { id: caso.id } })).fechaUltimoMovimiento
          const reiniciarMovimiento = () =>
            tx.siniestro.update({
              where: { id: caso.id },
              data: { fechaUltimoMovimiento: ultimoMovimiento },
            })

          const { id: cesvi } = await peritos.agregar(yo, caso.id, perito())
          await assert.rejects(
            peritos.agregar(yo, caso.id, perito({ nombre: 'Otro' })),
            (e) => e.status === 409 && /ya tiene un perito cesvi/.test(e.message),
          )
          // Cargar uno pendiente o cambiar sus datos no es movimiento
          await peritos.modificar(yo, caso.id, cesvi, perito({ telefono: '341 555-0000' }))
          assert.equal((await movimiento()).toISOString(), ultimoMovimiento.toISOString())
          // Lo mismo que está guardado no registra nada
          await peritos.modificar(yo, caso.id, cesvi, perito({ telefono: '341 555-0000' }))
          await assert.rejects(
            peritos.modificar(yo, caso.id, cesvi, perito({ tipoPerito: 'MEDICO' })),
            (e) => e.status === 400,
          )

          // Registrar el cierre sí es movimiento
          await peritos.modificar(
            yo,
            caso.id,
            cesvi,
            perito({
              telefono: '341 555-0000',
              email: 'jorge@example.com',
              fechaCierre: '2026-10-20',
            }),
          )
          const guardado = await tx.perito.findUniqueOrThrow({ where: { id: cesvi } })
          assert.equal(guardado.cerrado, true)
          assert.ok((await movimiento()) > ultimoMovimiento)

          // Corregir la fecha de un cierre ya registrado, no
          await reiniciarMovimiento()
          await peritos.modificar(
            yo,
            caso.id,
            cesvi,
            perito({
              telefono: '341 555-0000',
              email: 'jorge@example.com',
              fechaCierre: '2026-10-21',
            }),
          )
          assert.equal((await movimiento()).toISOString(), ultimoMovimiento.toISOString())

          // Cargarlo ya cerrado, sí
          const { id: medico } = await peritos.agregar(
            yo,
            caso.id,
            perito({ tipoPerito: 'MEDICO', nombre: 'Dra. Paula Ríos', fechaCierre: '2026-10-15' }),
          )
          assert.ok((await movimiento()) > ultimoMovimiento)

          // Dado de baja, deja lugar para otro del mismo tipo
          await peritos.darDeBaja(yo, caso.id, medico)
          assert.equal(
            (await tx.perito.findUniqueOrThrow({ where: { id: medico } })).eliminado,
            true,
          )
          await peritos.agregar(
            yo,
            caso.id,
            perito({ tipoPerito: 'MEDICO', nombre: 'Dr. Iván Sosa' }),
          )

          assert.deepEqual(await historial(), [
            [
              'ABOGADO',
              'Ana Prueba agregó al abogado Sofía Herrera, que representa a Martín Quiroga y una persona sin nombre,',
            ],
            [
              'ABOGADO',
              'Ana Prueba modificó los datos del abogado Sofía Herrera (a quién representa)',
            ],
            ['ABOGADO', 'Ana Prueba modificó los datos del abogado Luis Maidana (teléfono)'],
            ['ABOGADO', 'Ana Prueba dio de baja al abogado Valeria Quintana'],
            ['ABOGADO', 'Ana Prueba dio de baja al abogado Sofía Herrera'],
            ['PERITO', 'Ana Prueba cargó al perito CESVI Jorge Benítez'],
            ['PERITO', 'Ana Prueba modificó los datos del perito CESVI Jorge Benítez (teléfono)'],
            [
              'PERITO',
              'Ana Prueba registró el cierre de la pericia CESVI de Jorge Benítez y modificó email',
            ],
            [
              'PERITO',
              'Ana Prueba modificó los datos del perito CESVI Jorge Benítez (fecha de cierre)',
            ],
            ['PERITO', 'Ana Prueba cargó al perito médico Dra. Paula Ríos con la pericia cerrada'],
            ['PERITO', 'Ana Prueba dio de baja al perito médico Dra. Paula Ríos'],
            ['PERITO', 'Ana Prueba cargó al perito médico Dr. Iván Sosa'],
          ])

          // Cerrado: solo lectura
          await assert.rejects(
            peritos.agregar(yo, cerrado.id, perito()),
            (e) => e.status === 409 && /cerrado/.test(e.message),
          )
          await assert.rejects(
            abogados.agregar(yo, cerrado.id, abogado()),
            (e) => e.status === 409 && /cerrado/.test(e.message),
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
