import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizarDocumento,
  ocupanteAltaSchema,
  personaExternaAltaSchema,
  titularAltaSchema,
} from '../../shared/src/schemas/siniestros-alta.ts'
import { documentoRepetido, nombresPersonas } from '../src/features/siniestros/personas-alta.ts'

// Alta de siniestro, paso 2 (E4-06): titular y ocupantes de cada vehículo.
const vacia = {
  lugar: '',
  lugarOtro: '',
  nombreCompletoRazonSocial: '',
  idTipoDocumento: '',
  documento: '',
  estadoCivil: '',
  sexo: '',
  fechaNacimiento: '',
  numeroPermisoConducir: '',
  fechaVencimientoCarnet: '',
  telefono: '',
  email: '',
  domicilio: { idProvincia: '', localidad: '', calle: '', codigoPostal: '' },
  conLesiones: false,
  tipoLesion: '',
  descripcionLesiones: '',
}
const titular = (datos) => ({ ...vacia, ibaEnVehiculo: true, ...datos })
const ocupante = (datos) => ({ ...vacia, relacionPropietario: '', ...datos })
const mensajes = (schema, datos) =>
  (schema.safeParse(datos).error?.issues ?? []).map((i) => i.message)

test('todo es opcional: una persona vacía se puede guardar', () => {
  assert.deepEqual(mensajes(titularAltaSchema, titular({})), [])
  assert.deepEqual(mensajes(ocupanteAltaSchema, ocupante({})), [])
})

test('si el titular no iba en el vehículo, no se guarda dónde iba', () => {
  const datos = titularAltaSchema.parse(
    titular({ ibaEnVehiculo: false, lugar: 'Otro', lugarOtro: 'en la caja' }),
  )
  assert.equal(datos.lugar, null)
  assert.equal(datos.lugarOtro, null)
})

test('la relación con el titular solo se guarda para quien manejaba', () => {
  const relacion = (lugar) =>
    ocupanteAltaSchema.parse(ocupante({ lugar, relacionPropietario: 'Hijo del titular' }))
      .relacionPropietario
  assert.equal(relacion('Conductor/a'), 'Hijo del titular')
  assert.equal(relacion('Pasajero/a'), null)
})

test('lesiones detrás de un control: con lesiones se pide la gravedad; sin, no se guarda nada', () => {
  assert.deepEqual(mensajes(titularAltaSchema, titular({ conLesiones: true })), [
    'Elegí la gravedad de las lesiones',
  ])
  const sin = titularAltaSchema.parse(
    titular({ tipoLesion: 'GRAVE', descripcionLesiones: 'Fractura' }),
  )
  assert.equal(sin.tipoLesion, null)
  assert.equal(sin.descripcionLesiones, null)
  const con = titularAltaSchema.parse(titular({ conLesiones: true, tipoLesion: 'LEVE' }))
  assert.equal(con.tipoLesion, 'LEVE')
})

test('permiso de conducir: el vencimiento va con su número; "Otro" pide dónde iba', () => {
  assert.deepEqual(mensajes(titularAltaSchema, titular({ fechaVencimientoCarnet: '2027-05-01' })), [
    'Cargá también el número de permiso',
  ])
  assert.deepEqual(mensajes(ocupanteAltaSchema, ocupante({ lugar: 'Otro' })), ['Indicá dónde iba'])
  assert.deepEqual(mensajes(ocupanteAltaSchema, ocupante({ email: 'no-es-email' })), [
    'Ingresá un email válido',
  ])
})

test('sin nombre: "Desconocido 1, 2…" en el orden del alta; el documento repetido se avisa', () => {
  const persona = (clave, nombre, documento = null) => ({
    clave,
    nombreCompletoRazonSocial: nombre,
    documento,
  })
  const vehiculos = [
    {
      clave: 'v1',
      dominio: 'AE 123 CD',
      titular: persona('t1', null, '25.884.301'),
      ocupantes: [persona('o1', 'Martín Quiroga'), persona('o2', null)],
    },
    { clave: 'v2', dominio: 'AB 456 EF', titular: persona('t2', null), ocupantes: [] },
  ]
  const involucrados = { vehiculos, personasExternas: [] }
  const nombres = nombresPersonas(involucrados)
  assert.deepEqual(
    ['t1', 'o1', 'o2', 't2'].map((c) => nombres.get(c)),
    ['Desconocido 1', 'Martín Quiroga', 'Desconocido 2', 'Desconocido 3'],
  )
  assert.equal(normalizarDocumento('25.884.301'), normalizarDocumento('25884301'))
  assert.equal(documentoRepetido(involucrados, '25884301', 'o1'), 'titular del vehículo AE 123 CD')
  assert.equal(
    documentoRepetido(involucrados, '25884301', 't1'),
    null,
    'no se compara consigo misma',
  )
  assert.equal(documentoRepetido(involucrados, '', 'o1'), null)
})

// E4-07: personas fuera de los vehículos (peatones, testigos, dueños de propiedades)
const {
  lugar: _l,
  lugarOtro: _lo,
  numeroPermisoConducir: _n,
  fechaVencimientoCarnet: _f,
  ...datosPersonales
} = vacia
const externa = (datos) => ({ ...datosPersonales, rolSinVehiculo: 'Testigo', ...datos })

test('persona fuera de los vehículos: el rol es obligatorio y no lleva permiso de conducir', () => {
  assert.deepEqual(mensajes(personaExternaAltaSchema, externa({})), [])
  assert.deepEqual(mensajes(personaExternaAltaSchema, externa({ rolSinVehiculo: '   ' })), [
    'Indicá qué rol tuvo en el siniestro',
  ])
  assert.equal(
    personaExternaAltaSchema.safeParse(externa({ numeroPermisoConducir: '123' })).success,
    false,
    'el permiso no es un dato de quien no iba en un vehículo',
  )
  assert.equal(
    personaExternaAltaSchema.parse(externa({ rolSinVehiculo: ' Dueño del comercio ' }))
      .rolSinVehiculo,
    'Dueño del comercio',
  )
})

test('persona fuera de los vehículos: lesiones con gravedad y descripción', () => {
  assert.deepEqual(mensajes(personaExternaAltaSchema, externa({ conLesiones: true })), [
    'Elegí la gravedad de las lesiones',
  ])
  const con = personaExternaAltaSchema.parse(
    externa({ conLesiones: true, tipoLesion: 'GRAVE', descripcionLesiones: 'Fractura de tibia' }),
  )
  assert.equal(con.tipoLesion, 'GRAVE')
  assert.equal(con.descripcionLesiones, 'Fractura de tibia')
  const sin = personaExternaAltaSchema.parse(externa({ tipoLesion: 'LEVE' }))
  assert.equal(sin.tipoLesion, null)
})

test('fuera de los vehículos: siguen la numeración de Desconocido y entran en el aviso de documento', () => {
  const vehiculos = [
    {
      clave: 'v1',
      dominio: 'AE 123 CD',
      titular: { clave: 't1', nombreCompletoRazonSocial: null, documento: null },
      ocupantes: [],
    },
  ]
  const personasExternas = [
    {
      clave: 'e1',
      rolSinVehiculo: 'Peatón',
      nombreCompletoRazonSocial: null,
      documento: '30.111.222',
    },
    {
      clave: 'e2',
      rolSinVehiculo: 'Testigo',
      nombreCompletoRazonSocial: 'Ana Ruiz',
      documento: null,
    },
  ]
  const involucrados = { vehiculos, personasExternas }
  const nombres = nombresPersonas(involucrados)
  assert.deepEqual(
    ['t1', 'e1', 'e2'].map((c) => nombres.get(c)),
    ['Desconocido 1', 'Desconocido 2', 'Ana Ruiz'],
  )
  assert.equal(
    documentoRepetido(involucrados, '30111222', 't1'),
    'persona fuera de los vehículos (Peatón)',
  )
})
