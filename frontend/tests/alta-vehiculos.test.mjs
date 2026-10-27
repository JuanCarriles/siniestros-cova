import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizarDominio, vehiculoAltaSchema } from '../../shared/src/schemas/siniestros-alta.ts'

// Alta de siniestro, paso 2 (E4-05): lo que se escribe en el modal de vehículo.
const vacio = {
  rolAccidente: '',
  marca: '',
  modelo: '',
  version: '',
  dominio: '',
  numeroChasis: '',
  numeroMotor: '',
  anio: '',
  uso: '',
  tipo: '',
  color: '',
  idAseguradora: '',
  acreedorPrendario: '',
  descripcionDanos: '',
}
const errores = (datos) =>
  (vehiculoAltaSchema.safeParse({ ...vacio, ...datos }).error?.issues ?? []).map((i) => i.path[0])

test('solo el rol y el dominio son obligatorios; lo vacío se guarda como sin dato', () => {
  assert.deepEqual(errores({}).sort(), ['dominio', 'rolAccidente'])
  const datos = vehiculoAltaSchema.parse({
    ...vacio,
    rolAccidente: 'TERCERO',
    dominio: ' ae 123 cd ',
    numeroChasis: '8ap',
    anio: '2019',
  })
  assert.equal(datos.dominio, 'AE 123 CD')
  assert.equal(datos.numeroChasis, '8AP')
  assert.equal(datos.anio, 2019)
  assert.equal(datos.idAseguradora, null, 'sin aseguradora: sin seguro o no se sabe')
  assert.equal(datos.uso, null)
})

test('año entre 1900 y el año que viene; uso y rol de la lista', () => {
  const base = { rolAccidente: 'ASEGURADO', dominio: 'AA000AA' }
  assert.deepEqual(errores({ ...base, anio: '1899' }), ['anio'])
  assert.deepEqual(errores({ ...base, anio: String(new Date().getFullYear() + 2) }), ['anio'])
  assert.deepEqual(errores({ ...base, anio: String(new Date().getFullYear() + 1) }), [])
  assert.deepEqual(errores({ ...base, uso: 'OTRO' }), ['uso'])
  assert.deepEqual(errores({ ...base, rolAccidente: 'CONDUCTOR' }), ['rolAccidente'])
})

test('el dominio se compara sin espacios, guiones ni mayúsculas (CU-09 9.a)', () => {
  assert.equal(normalizarDominio('ae 123-cd'), normalizarDominio('AE123CD'))
  assert.notEqual(normalizarDominio('AE123CD'), normalizarDominio('AE123CE'))
})

test('sin rol elegido (los botones de opción mandan null) el mensaje es el propio', () => {
  const res = vehiculoAltaSchema.safeParse({ ...vacio, rolAccidente: null, dominio: 'AA000AA' })
  assert.deepEqual(
    res.error.issues.map((i) => i.message),
    ['Elegí si el vehículo es del asegurado o de un tercero'],
  )
})

test('un dominio sin letras ni números ("---") no identifica a ningún vehículo', () => {
  const mensajes = (dominio) =>
    (
      vehiculoAltaSchema.safeParse({ ...vacio, rolAccidente: 'TERCERO', dominio }).error?.issues ??
      []
    ).map((i) => i.message)
  assert.deepEqual(mensajes('---'), ['Ingresá un dominio válido'])
  assert.deepEqual(mensajes(' - - '), ['Ingresá un dominio válido'])
  assert.deepEqual(mensajes('AE-123-CD'), [])
})

test('volver a "Sin especificar" (vacío) borra el uso y la aseguradora elegidos', () => {
  const datos = vehiculoAltaSchema.parse({
    ...vacio,
    rolAccidente: 'TERCERO',
    dominio: 'AE 123 CD',
    uso: '',
    idAseguradora: '',
  })
  assert.equal(datos.uso, null)
  assert.equal(datos.idAseguradora, null)
})
