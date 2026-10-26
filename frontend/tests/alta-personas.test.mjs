import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizarDocumento,
  ocupanteAltaSchema,
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
  const nombres = nombresPersonas(vehiculos)
  assert.deepEqual(
    ['t1', 'o1', 'o2', 't2'].map((c) => nombres.get(c)),
    ['Desconocido 1', 'Martín Quiroga', 'Desconocido 2', 'Desconocido 3'],
  )
  assert.equal(normalizarDocumento('25.884.301'), normalizarDocumento('25884301'))
  assert.equal(documentoRepetido(vehiculos, '25884301', 'o1'), 'titular del vehículo AE 123 CD')
  assert.equal(documentoRepetido(vehiculos, '25884301', 't1'), null, 'no se compara consigo misma')
  assert.equal(documentoRepetido(vehiculos, '', 'o1'), null)
})
