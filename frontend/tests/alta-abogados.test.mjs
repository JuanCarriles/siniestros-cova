import assert from 'node:assert/strict'
import test from 'node:test'
import { abogadoAltaSchema } from '../../shared/src/schemas/siniestros-alta.ts'
import { nombresPersonas } from '../src/features/siniestros/personas-alta.ts'
import {
  gruposRepresentables,
  guardarAbogado,
  limpiarRepresentados,
  representantes,
} from '../src/features/siniestros/abogados-alta.ts'

// Alta de siniestro, paso 3 (E4-08): abogados y a quién representa cada uno.
const vacio = {
  nombreCompleto: '',
  numeroMatricula: '',
  telefono: '',
  email: '',
  representados: [],
}
const mensajes = (datos) =>
  (abogadoAltaSchema.safeParse({ ...vacio, ...datos }).error?.issues ?? []).map((i) => i.message)

test('solo el nombre y a quién representa son obligatorios (CU-09 25.b)', () => {
  assert.deepEqual(mensajes({}), [
    'Ingresá el nombre completo',
    'Elegí al menos una persona a la que representa',
  ])
  const datos = abogadoAltaSchema.parse({
    ...vacio,
    nombreCompleto: ' Dra. Paula Sánchez ',
    representados: ['t1'],
  })
  assert.equal(datos.nombreCompleto, 'Dra. Paula Sánchez')
  assert.equal(datos.numeroMatricula, null)
  assert.equal(datos.email, null)
})

test('la matrícula es texto ("T° 45 F° 123") y el email, si se carga, tiene que ser válido', () => {
  const datos = abogadoAltaSchema.parse({
    ...vacio,
    nombreCompleto: 'Luis Maidana',
    numeroMatricula: 'T° 45 F° 123',
    representados: ['t1', 'e1'],
  })
  assert.equal(datos.numeroMatricula, 'T° 45 F° 123')
  assert.deepEqual(datos.representados, ['t1', 'e1'], 'puede representar a varias (25.a)')
  assert.deepEqual(mensajes({ nombreCompleto: 'X', representados: ['t1'], email: 'no-es' }), [
    'Ingresá un email válido',
  ])
})

const persona = (clave, nombre = null) => ({ clave, nombreCompletoRazonSocial: nombre })
const involucrados = {
  vehiculos: [
    {
      clave: 'v1',
      dominio: 'AE 123 CD',
      rolAccidente: 'TERCERO',
      titular: persona('t1', 'Ana Ruiz'),
      ocupantes: [{ ...persona('o1'), lugar: 'Otro', lugarOtro: 'en la caja' }],
    },
    { clave: 'v2', dominio: 'AB 456 EF', rolAccidente: 'ASEGURADO', titular: null, ocupantes: [] },
  ],
  personasExternas: [{ ...persona('e1'), rolSinVehiculo: 'Peatón' }],
}
const abogado = (clave, representados) => ({
  clave,
  nombreCompleto: `Abogado ${clave}`,
  numeroMatricula: null,
  telefono: null,
  email: null,
  representados,
})

test('las personas para elegir se agrupan como en el paso 2; un vehículo sin personas no aparece', () => {
  assert.deepEqual(gruposRepresentables(involucrados, nombresPersonas(involucrados)), [
    {
      titulo: 'Vehículo AE 123 CD · Tercero',
      personas: [
        { clave: 't1', nombre: 'Ana Ruiz', detalle: 'Titular', dominio: 'AE 123 CD' },
        {
          clave: 'o1',
          nombre: 'Desconocido 1',
          detalle: 'Ocupante · en la caja',
          dominio: 'AE 123 CD',
        },
      ],
    },
    {
      titulo: 'Fuera de los vehículos',
      personas: [{ clave: 'e1', nombre: 'Desconocido 2', detalle: 'Peatón' }],
    },
  ])
})

test('cada persona tiene un solo abogado: elegirla en otro la pasa y se avisa de dónde salió', () => {
  const antes = [abogado('a1', ['t1', 'o1'])]
  const { abogados, pasadas } = guardarAbogado(antes, abogado('a2', ['o1', 'e1']))
  assert.deepEqual(
    abogados.map((a) => [a.clave, a.representados]),
    [
      ['a1', ['t1']],
      ['a2', ['o1', 'e1']],
    ],
  )
  assert.deepEqual(pasadas, [{ abogado: 'Abogado a1', cantidad: 1 }])
  assert.equal(representantes(abogados).get('o1').clave, 'a2')

  const modificado = guardarAbogado(abogados, abogado('a1', ['t1']))
  assert.deepEqual(
    modificado.pasadas,
    [],
    'modificar sin cambiar a quién representa no mueve a nadie',
  )
  assert.equal(modificado.abogados.length, 2)
})

test('si se quita a una persona en el paso 2, deja de figurar en su abogado', () => {
  const abogados = [abogado('a1', ['t1', 'o1']), abogado('a2', ['e1'])]
  assert.equal(
    limpiarRepresentados(abogados, involucrados),
    abogados,
    'sin cambios, la misma lista',
  )
  const sinExternas = { ...involucrados, personasExternas: [] }
  assert.deepEqual(
    limpiarRepresentados(abogados, sinExternas).map((a) => a.representados),
    [['t1', 'o1'], []],
    'a2 queda sin representados: se marca para corregir',
  )
})
