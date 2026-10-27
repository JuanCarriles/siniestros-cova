import assert from 'node:assert/strict'
import test from 'node:test'
import { crearSiniestroSchema } from '@cova/shared/schemas/siniestros-alta'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioCrearSiniestro } from '../src/modules/siniestros/siniestros-alta-crear.service.ts'

// CU-09 paso 36 (E4-10): crear el siniestro con todo lo cargado en el alta, en una sola transacción.
test('PostgreSQL: crear siniestro desde el alta, con asignación, aviso interno y mail', async () => {
  const prisma = getPrisma()
  const rollback = new Error('Fin de prueba: revertir los datos')
  const marca = Date.now()
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const usuario = async (nombres, tipoUsuario) =>
            tx.usuario.create({
              data: {
                nombres,
                apellidos: `Prueba ${marca}`,
                documento: '0',
                telefono: '0',
                email: `${nombres.toLowerCase()}.${marca}@example.invalid`,
                contrasena: '-',
                tipoUsuario,
                idDireccion: (await tx.direccion.create({ data: {} })).id,
              },
            })
          const admin = await usuario('Admin', 'ADMINISTRADOR')
          const gestor = await usuario('Gestora', 'GESTOR')
          const aseguradora = await tx.aseguradora.create({ data: { nombre: `Crear ${marca}` } })
          const provincia = await tx.provincia.findFirstOrThrow({ where: { eliminado: false } })
          const tipoDocumento = await tx.tipoDocumento.findFirstOrThrow({
            where: { eliminado: false },
          })
          const primerEstado = await tx.estadoSiniestro.findFirstOrThrow({
            where: { eliminado: false, esCierre: false },
            orderBy: { id: 'asc' },
          })

          const avisos = []
          const r2 = { fallaCopia: false, borradas: [] }
          let mailFalla = false
          const servicio = crearServicioCrearSiniestro({
            transaccion: (trabajo) => trabajo(tx),
            // R2 simulado: al crear, los documentos del alta se copian a la carpeta del siniestro
            almacenamiento: () => ({
              copiar: async (clave, carpeta) => {
                if (r2.fallaCopia) throw new Error('R2 caído')
                return `${carpeta}/${clave.split('/').pop()}`
              },
              eliminar: async (clave) => {
                r2.borradas.push(clave)
              },
            }),
            enviarAvisoAsignacion: async (aviso) => {
              if (mailFalla) throw new Error('Resend caído')
              avisos.push(aviso)
            },
            urlSistema: 'https://cova.example/',
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
          const vehiculo = (dominio, rolAccidente) => ({
            rolAccidente,
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
          const numero = `CREAR-${marca}`
          const entrada = {
            datosCaso: {
              numeroSiniestro: numero,
              numeroPoliza: 'POL-1',
              inicioVigencia: '',
              idAseguradora: aseguradora.id,
              sucursal: 'Centro',
              idAjustador: '',
              fechaOcurrencia: '2026-10-20',
              horaOcurrencia: '14:30',
              menorEdadInvolucrado: false,
              causa: 'Choque en cruce',
              lugar: {
                idProvincia: provincia.id,
                localidad: 'Rosario',
                calle: '',
                codigoPostal: '',
              },
            },
            vehiculos: [
              {
                datos: vehiculo('AE 123 CD', 'ASEGURADO'),
                titular: {
                  clave: 't1',
                  datos: persona({
                    ibaEnVehiculo: true,
                    lugar: 'Conductor/a',
                    lugarOtro: '',
                    nombreCompletoRazonSocial: 'Ana Ruiz',
                    idTipoDocumento: tipoDocumento.id,
                    documento: '30111222',
                    domicilio: {
                      idProvincia: provincia.id,
                      localidad: '',
                      calle: 'San Martín 1',
                      codigoPostal: '',
                    },
                    ...permiso,
                  }),
                },
                ocupantes: [
                  {
                    clave: 'o1',
                    datos: persona({
                      lugar: 'Otro',
                      lugarOtro: 'en la caja',
                      relacionPropietario: '',
                      conLesiones: true,
                      tipoLesion: 'LEVE',
                      ...permiso,
                    }),
                  },
                ],
              },
              // Sin titular ni ocupantes (CU-09 11.a): igual pertenece al siniestro
              { datos: vehiculo('AB 456 EF', 'TERCERO'), titular: null, ocupantes: [] },
            ],
            personasExternas: [{ clave: 'e1', datos: persona({ rolSinVehiculo: 'Testigo' }) }],
            abogados: [
              {
                nombreCompleto: 'Dra. Paula Sánchez',
                numeroMatricula: 'T° 45 F° 123',
                telefono: '',
                email: '',
                representados: ['o1', 'e1'],
              },
            ],
            peritos: [
              {
                tipoPerito: 'MEDICO',
                nombre: 'Dra. Ríos',
                telefono: '',
                email: '',
                fechaSolicitud: '2026-10-21',
                fechaCierre: '',
              },
            ],
            documentos: [
              {
                clave: `altas/${admin.id}/doc.pdf`,
                nombreOriginal: 'Denuncia.pdf',
                tipoExtension: 'pdf',
                mimeType: 'application/pdf',
                tamanoBytes: 1234,
              },
            ],
            idUsuarioAsignado: gestor.id,
          }

          // Asignación obligatoria (35.a)
          const sinAsignar = crearSiniestroSchema.safeParse({ ...entrada, idUsuarioAsignado: '' })
          assert.equal(
            sinAsignar.error.issues[0].message,
            'La asignación es obligatoria: elegí a quién se le asigna el siniestro',
          )

          const creado = await servicio.crear(admin, crearSiniestroSchema.parse(entrada))
          assert.equal(creado.numeroSiniestro, numero)
          assert.equal(creado.correoEnviado, true)
          assert.deepEqual(avisos, [
            {
              email: gestor.email,
              nombre: 'Gestora',
              numeroSiniestro: numero,
              aseguradora: aseguradora.nombre,
              asignadoPor: `Admin Prueba ${marca}`,
              enlace: `https://cova.example/siniestros/${creado.id}`,
            },
          ])

          const s = await tx.siniestro.findUniqueOrThrow({
            where: { id: creado.id },
            include: {
              direccion: true,
              vehiculos: { orderBy: { id: 'asc' }, include: { personasInvolucradas: true } },
              personasInvolucradas: { orderBy: { id: 'asc' }, include: { direccion: true } },
              peritos: true,
              documentos: true,
              eventosHistorial: { orderBy: { id: 'asc' } },
              notificaciones: true,
            },
          })
          assert.equal(s.idUsuario, gestor.id, 'asignado al gestor elegido')
          assert.equal(s.idEstadoSiniestro, primerEstado.id, 'nace en el primer estado abierto')
          assert.equal(s.fechaOcurrencia.toISOString().slice(0, 10), '2026-10-20')
          assert.equal(s.direccion.localidad, 'Rosario')

          assert.deepEqual(
            s.vehiculos.map((v) => [v.dominio, v.personasInvolucradas.length]),
            [
              ['AE 123 CD', 2],
              ['AB 456 EF', 0],
            ],
          )
          const [titular, ocupante, testigo] = s.personasInvolucradas
          assert.equal(titular.esPropietario, true)
          assert.equal(titular.rolEnVehiculo, 'Conductor/a')
          assert.equal(titular.direccion.calle, 'San Martín 1')
          assert.equal(titular.idAbogado, null)
          assert.equal(ocupante.nombreCompletoRazonSocial, null, 'sin nombre se guarda vacío')
          assert.equal(ocupante.rolEnVehiculo, 'en la caja')
          assert.equal(ocupante.tipoLesion, 'LEVE')
          assert.equal(testigo.rolSinVehiculo, 'Testigo')
          assert.equal(testigo.idVehiculo, null)
          assert.ok(ocupante.idAbogado && ocupante.idAbogado === testigo.idAbogado, 'mismo abogado')
          const abogado = await tx.abogado.findUniqueOrThrow({ where: { id: testigo.idAbogado } })
          assert.equal(abogado.numeroMatricula, 'T° 45 F° 123')

          assert.equal(s.peritos[0].cerrado, false, 'sin fecha de cierre: pendiente')
          // Pasó a la carpeta del siniestro y el original de altas/ se borró
          assert.equal(s.documentos[0].urlArchivoSinDominio, `siniestros/${creado.id}/doc.pdf`)
          assert.deepEqual(r2.borradas, [`altas/${admin.id}/doc.pdf`])
          assert.deepEqual(
            s.eventosHistorial.map((e) => e.tipoEvento),
            ['DOCUMENTO', 'ASIGNACION'],
          )
          assert.deepEqual(
            s.notificaciones.map((n) => [n.idUsuario, n.tipoNotificacion, n.leida]),
            [[gestor.id, 'ASIGNACION_SINIESTRO', false]],
          )

          // El mismo número para la misma aseguradora: rechazado aunque el paso 1 lo hubiera aceptado
          await assert.rejects(
            servicio.crear(admin, crearSiniestroSchema.parse(entrada)),
            (error) => error.status === 409 && error.details?.campo === 'numeroSiniestro',
          )
          // Un documento de otro usuario no se puede asociar
          await assert.rejects(
            servicio.crear(
              admin,
              crearSiniestroSchema.parse({
                ...entrada,
                datosCaso: { ...entrada.datosCaso, numeroSiniestro: `${numero}-B` },
                documentos: [{ ...entrada.documentos[0], clave: `altas/${gestor.id}/ajeno.pdf` }],
              }),
            ),
            { status: 403 },
          )
          // Si el mail falla, el siniestro igual queda creado (36.a)
          mailFalla = true
          const sinMail = await servicio.crear(
            admin,
            crearSiniestroSchema.parse({
              ...entrada,
              datosCaso: { ...entrada.datosCaso, numeroSiniestro: `${numero}-C` },
              documentos: [],
            }),
          )
          assert.equal(sinMail.correoEnviado, false)
          assert.ok(await tx.siniestro.findUnique({ where: { id: sinMail.id } }))

          // Si R2 no puede copiar, el documento sigue apuntando a altas/: el archivo existe y no se borra
          r2.fallaCopia = true
          r2.borradas.length = 0
          const sinCopia = await servicio.crear(
            admin,
            crearSiniestroSchema.parse({
              ...entrada,
              datosCaso: { ...entrada.datosCaso, numeroSiniestro: `${numero}-D` },
            }),
          )
          const documento = await tx.documentoSiniestro.findFirstOrThrow({
            where: { idSiniestro: sinCopia.id },
          })
          assert.equal(documento.urlArchivoSinDominio, `altas/${admin.id}/doc.pdf`)
          assert.deepEqual(r2.borradas, [])

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
