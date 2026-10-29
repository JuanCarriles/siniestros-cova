import assert from 'node:assert/strict'
import test from 'node:test'
import { crearSiniestroSchema } from '@cova/shared/schemas/siniestros-alta'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioCrearSiniestro } from '../src/modules/siniestros/siniestros-alta-crear.service.ts'
import { HttpError } from '../src/utils/httpError.ts'

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
          // faltan: claves que ya no están en R2; fallaCopiaEn: la copia número N falla (R2 caído)
          const r2 = { faltan: new Set(), fallaCopiaEn: 0, copias: 0, borradas: [] }
          let mailFalla = false
          const servicio = crearServicioCrearSiniestro({
            transaccion: (trabajo) => trabajo(tx),
            // R2 simulado: al crear, los documentos del alta se copian a la carpeta del siniestro
            almacenamiento: () => ({
              comprobarExistencia: async (clave) => {
                if (r2.faltan.has(clave)) throw new HttpError(404, 'No está')
              },
              copiar: async (clave, carpeta) => {
                if (++r2.copias === r2.fallaCopiaEn) throw new Error('R2 caído')
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

          // Un archivo del alta que ya no está en R2 (la regla de 30 días lo borró): no se crea nada y se dice
          // cuál volver a cargar
          r2.faltan.add(`altas/${admin.id}/doc.pdf`)
          await assert.rejects(
            servicio.crear(
              admin,
              crearSiniestroSchema.parse({
                ...entrada,
                datosCaso: { ...entrada.datosCaso, numeroSiniestro: `${numero}-D` },
              }),
            ),
            (error) =>
              error.status === 409 &&
              error.details?.campo === 'documentos' &&
              error.message.startsWith('«Denuncia.pdf» ya no está disponible'),
          )
          assert.equal(await tx.siniestro.count({ where: { numeroSiniestro: `${numero}-D` } }), 0)
          r2.faltan.clear()

          // Si R2 falla a mitad de las copias, el alta no se crea (503), se borran las copias ya hechas y los
          // originales quedan para reintentar. (Acá la transacción es la de la prueba: lo insertado antes del
          // error no se revierte; en el servicio real, sí.)
          const dos = [
            entrada.documentos[0],
            {
              ...entrada.documentos[0],
              clave: `altas/${admin.id}/otro.pdf`,
              nombreOriginal: 'Fotos.pdf',
            },
          ]
          r2.copias = 0
          r2.fallaCopiaEn = 2
          r2.borradas.length = 0
          await assert.rejects(
            servicio.crear(
              admin,
              crearSiniestroSchema.parse({
                ...entrada,
                datosCaso: { ...entrada.datosCaso, numeroSiniestro: `${numero}-E` },
                documentos: dos,
              }),
            ),
            { status: 503 },
          )
          assert.equal(r2.borradas.length, 1)
          assert.match(r2.borradas[0], /^siniestros\/\d+\/doc\.pdf$/)

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

// Dos altas simultáneas con el mismo número y aseguradora: las dos pasan la consulta previa y la base frena a la
// segunda con el índice único (migración numero_siniestro_unico). Transacciones reales: se limpian al final.
test('PostgreSQL: dos altas simultáneas con el mismo número, solo se crea una', async () => {
  const prisma = getPrisma()
  const marca = Date.now()
  const aseguradora = await prisma.aseguradora.create({ data: { nombre: `Simultanea ${marca}` } })
  const usuario = await prisma.usuario.create({
    data: {
      nombres: 'Admin',
      apellidos: `Simultanea ${marca}`,
      documento: '0',
      telefono: '0',
      email: `simultanea.${marca}@example.invalid`,
      contrasena: '-',
      tipoUsuario: 'ADMINISTRADOR',
      idDireccion: (await prisma.direccion.create({ data: {} })).id,
    },
  })
  try {
    // Barrera: ninguna inserta el siniestro hasta que las dos pasaron la consulta del número repetido
    let llegaron = 0
    let soltar
    const barrera = new Promise((r) => (soltar = r))
    const enlazar = (objeto, clave) =>
      typeof objeto[clave] === 'function' ? objeto[clave].bind(objeto) : objeto[clave]
    const conBarrera = (tx) =>
      new Proxy(tx, {
        get: (base, clave) =>
          clave !== 'siniestro'
            ? enlazar(base, clave)
            : new Proxy(base.siniestro, {
                get: (delegado, metodo) =>
                  metodo !== 'create'
                    ? enlazar(delegado, metodo)
                    : async (args) => {
                        if (++llegaron === 2) soltar()
                        await barrera
                        return delegado.create(args)
                      },
              }),
      })
    const servicio = crearServicioCrearSiniestro({
      transaccion: (trabajo) =>
        prisma.$transaction((tx) => trabajo(conBarrera(tx)), { timeout: 20_000 }),
      almacenamiento: () => ({}),
      enviarAvisoAsignacion: async () => {},
      urlSistema: 'https://cova.example/',
    })
    const alta = (numero) =>
      crearSiniestroSchema.parse({
        datosCaso: {
          numeroSiniestro: numero,
          numeroPoliza: 'POL-1',
          inicioVigencia: '',
          idAseguradora: aseguradora.id,
          sucursal: 'Centro',
          idAjustador: '',
          fechaOcurrencia: '',
          horaOcurrencia: '',
          menorEdadInvolucrado: false,
          causa: '',
          lugar: { idProvincia: '', localidad: '', calle: '', codigoPostal: '' },
        },
        vehiculos: [],
        personasExternas: [],
        abogados: [],
        peritos: [],
        documentos: [],
        idUsuarioAsignado: usuario.id,
      })

    // El mismo número salvo mayúsculas también es repetido
    const resultados = await Promise.allSettled([
      servicio.crear(usuario, alta(`SIM-${marca}`)),
      servicio.crear(usuario, alta(`sim-${marca}`)),
    ])
    const rechazados = resultados.filter((r) => r.status === 'rejected')
    assert.equal(resultados.length - rechazados.length, 1, 'se crea una sola')
    assert.equal(rechazados[0]?.reason.status, 409)
    assert.equal(rechazados[0]?.reason.details?.campo, 'numeroSiniestro')
    assert.equal(await prisma.siniestro.count({ where: { idAseguradora: aseguradora.id } }), 1)
  } finally {
    const ids = (
      await prisma.siniestro.findMany({
        where: { idAseguradora: aseguradora.id },
        select: { id: true },
      })
    ).map((s) => s.id)
    await prisma.notificacion.deleteMany({ where: { idSiniestro: { in: ids } } })
    await prisma.historialSiniestro.deleteMany({ where: { idSiniestro: { in: ids } } })
    await prisma.siniestro.deleteMany({ where: { id: { in: ids } } })
    await prisma.usuario.delete({ where: { id: usuario.id } })
    await prisma.direccion.delete({ where: { id: usuario.idDireccion } })
    await prisma.aseguradora.delete({ where: { id: aseguradora.id } })
    await disconnectPrisma()
  }
})
