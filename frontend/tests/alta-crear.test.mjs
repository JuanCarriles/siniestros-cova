import assert from 'node:assert/strict'
import test from 'node:test'
import {
  abogadoAltaSchema,
  crearSiniestroSchema,
  ocupanteAltaSchema,
  peritoAltaSchema,
  personaExternaAltaSchema,
  titularAltaSchema,
  vehiculoAltaSchema,
} from '../../shared/src/schemas/siniestros-alta.ts'
import { armarAlta, mensajeAltaCreada } from '../src/features/siniestros/crear-alta.ts'

// Alta de siniestro, paso 5 (E4-10): de lo que guarda el borrador a lo que se manda al crear.
const persona = {
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
}
const permiso = { numeroPermisoConducir: '', fechaVencimientoCarnet: '' }

// El borrador guarda lo que devolvió cada schema (ya validado): se arma igual que en la pantalla
const borrador = {
  datosCaso: {
    numeroSiniestro: 'S-1',
    numeroPoliza: 'P-1',
    inicioVigencia: '',
    idAseguradora: '3',
    sucursal: 'Centro',
    idAjustador: '',
    fechaOcurrencia: '',
    horaOcurrencia: '',
    menorEdadInvolucrado: false,
    causa: '',
    pais: '1',
    lugar: { idProvincia: '', localidad: '', calle: '', codigoPostal: '' },
  },
  vehiculos: [
    {
      ...vehiculoAltaSchema.parse({
        rolAccidente: 'ASEGURADO',
        marca: 'Ford',
        modelo: '',
        version: '',
        dominio: 'ae 123 cd',
        numeroChasis: '',
        numeroMotor: '',
        anio: '2020',
        uso: '',
        tipo: '',
        color: '',
        idAseguradora: '',
        acreedorPrendario: '',
        descripcionDanos: '',
      }),
      clave: 'v1',
      titular: {
        ...titularAltaSchema.parse({
          ...persona,
          ...permiso,
          ibaEnVehiculo: true,
          lugar: 'Conductor/a',
          lugarOtro: '',
          documento: '30.111.222',
          email: 'ana@example.com',
        }),
        clave: 't1',
      },
      ocupantes: [
        {
          ...ocupanteAltaSchema.parse({
            ...persona,
            ...permiso,
            lugar: '',
            lugarOtro: '',
            relacionPropietario: '',
            conLesiones: true,
            tipoLesion: 'GRAVE',
          }),
          clave: 'o1',
        },
      ],
    },
  ],
  personasExternas: [
    { ...personaExternaAltaSchema.parse({ ...persona, rolSinVehiculo: 'Testigo' }), clave: 'e1' },
  ],
  abogados: [
    {
      ...abogadoAltaSchema.parse({
        nombreCompleto: 'Dra. Paz',
        numeroMatricula: '',
        telefono: '',
        email: '',
        representados: ['o1', 'e1'],
      }),
      clave: 'a1',
    },
  ],
  peritos: [
    peritoAltaSchema.parse({
      tipoPerito: 'CESVI',
      nombre: 'Ing. Vera',
      telefono: '',
      email: '',
      fechaSolicitud: '2026-10-01',
      fechaCierre: '2026-10-10',
    }),
  ],
  documentos: [
    {
      clave: 'altas/5/abc.pdf',
      nombreOriginal: 'Denuncia.pdf',
      tipoExtension: 'pdf',
      mimeType: 'application/pdf',
      tamanoBytes: 2048,
    },
  ],
  idUsuarioAsignado: 7,
}

test('lo que guarda el borrador, armado para crear, lo acepta el servidor tal cual', () => {
  const resultado = crearSiniestroSchema.safeParse(armarAlta(borrador))
  assert.deepEqual(resultado.error?.issues ?? [], [])
  const alta = resultado.data
  assert.equal(alta.vehiculos[0].datos.dominio, 'AE 123 CD')
  assert.equal(alta.vehiculos[0].titular.clave, 't1')
  assert.equal(alta.peritos[0].cerrado, true)
  assert.equal(alta.idUsuarioAsignado, 7)
})

test('no se mandan el país ni las claves de vehículos y abogados ni si la pericia está cerrada', () => {
  const alta = armarAlta(borrador)
  assert.ok(!('pais' in alta.datosCaso))
  assert.ok(!('clave' in alta.vehiculos[0].datos))
  assert.ok(!('clave' in alta.abogados[0]))
  assert.ok(!('cerrado' in alta.peritos[0]))
})

test('sin asignar no se puede crear (CU-09 35.a); sin documentos sí (32.a)', () => {
  const sinAsignar = crearSiniestroSchema.safeParse(
    armarAlta({ ...borrador, idUsuarioAsignado: null, documentos: [] }),
  )
  assert.deepEqual(
    sinAsignar.error.issues.map((i) => [i.path.join('.'), i.message]),
    [
      [
        'idUsuarioAsignado',
        'La asignación es obligatoria: elegí a quién se le asigna el siniestro',
      ],
    ],
  )
})

test('lo que cruza pasos también se controla: una persona con dos abogados, dos peritos CESVI', () => {
  const alta = armarAlta({
    ...borrador,
    abogados: [...borrador.abogados, { ...borrador.abogados[0], clave: 'a2' }],
    peritos: [...borrador.peritos, borrador.peritos[0]],
  })
  const mensajes = crearSiniestroSchema.safeParse(alta).error.issues.map((i) => i.message)
  assert.ok(mensajes.includes('Una persona tiene más de un abogado'))
  assert.ok(mensajes.includes('Puede haber un perito CESVI y uno médico como máximo'))
})

test('el aviso del listado dice si el mail no salió (36.a)', () => {
  const creado = { id: 1, numeroSiniestro: 'S-1', correoEnviado: true }
  assert.match(mensajeAltaCreada({ altaCreada: creado }), /en el sistema y por mail\.$/)
  assert.match(
    mensajeAltaCreada({ altaCreada: { ...creado, correoEnviado: false } }),
    /El aviso por mail no se pudo enviar/,
  )
  assert.equal(mensajeAltaCreada(null), null)
})
