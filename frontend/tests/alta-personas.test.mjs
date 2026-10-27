import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizarDocumento,
  ocupanteAltaSchema,
  titularAltaSchema,
} from '../../shared/src/schemas/siniestros-alta.ts'
import {
  documentoRepetido,
  nombresPersonas,
  paisDelDomicilio,
} from '../src/features/siniestros/personas-alta.ts'

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

test('documento repetido: dice dónde está cargada la otra persona, para corregirlo o cancelar (CU-09 13.b, 16.a)', () => {
  const vehiculos = [
    {
      clave: 'v1',
      dominio: 'AE 123 CD',
      titular: { clave: 't1', nombreCompletoRazonSocial: 'Ana Ruiz', documento: '30.111.222' },
      ocupantes: [{ clave: 'o1', nombreCompletoRazonSocial: null, documento: '27 444 555' }],
    },
  ]
  assert.equal(documentoRepetido(vehiculos, '30111222', null), 'titular del vehículo AE 123 CD')
  assert.equal(documentoRepetido(vehiculos, '27.444.555', 't1'), 'ocupante del vehículo AE 123 CD')
  assert.equal(
    documentoRepetido(vehiculos, '30111222', 't1'),
    null,
    'al modificarla, no choca consigo misma',
  )
  assert.equal(documentoRepetido(vehiculos, '99999999', null), null)
})

test('el país del domicilio se conserva aunque no se elija provincia', () => {
  const unPais = {
    paises: [{ id: 1, nombre: 'Argentina' }],
    provincias: [{ id: 7, nombre: 'Córdoba', idPais: 1 }],
  }
  assert.equal(paisDelDomicilio(7, unPais), '1', 'con provincia, el de la provincia')
  assert.equal(paisDelDomicilio(null, unPais), '1', 'sin provincia, el único país')
  const dosPaises = {
    paises: [...unPais.paises, { id: 2, nombre: 'Uruguay' }],
    provincias: [...unPais.provincias, { id: 30, nombre: 'Montevideo', idPais: 2 }],
  }
  assert.equal(paisDelDomicilio(30, dosPaises), '2')
  assert.equal(paisDelDomicilio(null, dosPaises), '', 'con varios países y sin provincia, se elige')
})

test('volver a "Sin especificar" (vacío) borra lo que se había elegido en cada lista', () => {
  const sinEspecificar = {
    idTipoDocumento: '',
    estadoCivil: '',
    sexo: '',
    domicilio: { ...vacia.domicilio, idProvincia: '' },
  }
  const t = titularAltaSchema.parse(titular({ ...sinEspecificar, lugar: '' }))
  const o = ocupanteAltaSchema.parse(ocupante({ ...sinEspecificar, lugar: '' }))
  for (const datos of [t, o]) {
    assert.equal(datos.idTipoDocumento, null)
    assert.equal(datos.estadoCivil, null)
    assert.equal(datos.sexo, null)
    assert.equal(datos.domicilio.idProvincia, null)
    assert.equal(datos.lugar, null)
  }
})
