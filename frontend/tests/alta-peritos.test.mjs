import assert from 'node:assert/strict'
import test from 'node:test'
import { hoyArgentina, peritoAltaSchema } from '../../shared/src/schemas/siniestros-alta.ts'
import { ponerPerito } from '../src/features/siniestros/peritos-alta.ts'

// Alta de siniestro, paso 4 (E4-09): peritos CESVI y médico.
const vacio = {
  tipoPerito: 'CESVI',
  nombre: '',
  telefono: '',
  email: '',
  fechaSolicitud: '',
  fechaCierre: '',
}
const mensajes = (datos) =>
  (peritoAltaSchema.safeParse({ ...vacio, ...datos }).error?.issues ?? []).map(
    (i) => `${i.path.join('.')}: ${i.message}`,
  )
const valido = { nombre: 'Ing. Marcos Paz', fechaSolicitud: '2026-10-10' }

test('el nombre y la fecha de solicitud son obligatorios; teléfono y email, no', () => {
  assert.deepEqual(mensajes({}), [
    'nombre: Ingresá el nombre del perito',
    'fechaSolicitud: Ingresá la fecha de solicitud',
  ])
  assert.deepEqual(mensajes(valido), [])
  assert.deepEqual(mensajes({ ...valido, email: 'no-es' }), ['email: Ingresá un email válido'])
})

test('sin fecha de cierre la pericia queda pendiente; con fecha, cerrada (CU-09 29.a)', () => {
  const pendiente = peritoAltaSchema.parse({ ...vacio, ...valido })
  assert.equal(pendiente.fechaCierre, null)
  assert.equal(pendiente.cerrado, false)
  const cerrada = peritoAltaSchema.parse({ ...vacio, ...valido, fechaCierre: '2026-10-20' })
  assert.equal(cerrada.cerrado, true)
})

test('fechas: nada posterior a hoy y el cierre no antes de la solicitud', () => {
  const manana = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
  assert.deepEqual(mensajes({ ...valido, fechaSolicitud: manana }), [
    'fechaSolicitud: La fecha no puede ser posterior a hoy',
  ])
  assert.deepEqual(mensajes({ ...valido, fechaCierre: manana }), [
    'fechaCierre: La fecha no puede ser posterior a hoy',
  ])
  assert.deepEqual(mensajes({ ...valido, fechaCierre: '2026-10-01' }), [
    'fechaCierre: El cierre no puede ser anterior a la solicitud',
  ])
  assert.deepEqual(
    mensajes({ ...valido, fechaCierre: valido.fechaSolicitud }),
    [],
    'el mismo día vale',
  )
  assert.deepEqual(mensajes({ ...valido, fechaSolicitud: hoyArgentina() }), [])
})

test('un perito CESVI y uno médico como máximo: cargar otro del mismo tipo lo reemplaza', () => {
  const perito = (tipoPerito, nombre) => ({ ...vacio, tipoPerito, nombre, cerrado: false })
  let peritos = ponerPerito([], perito('MEDICO', 'Dra. Ríos'))
  peritos = ponerPerito(peritos, perito('CESVI', 'Ing. Paz'))
  assert.deepEqual(
    peritos.map((p) => [p.tipoPerito, p.nombre]),
    [
      ['CESVI', 'Ing. Paz'],
      ['MEDICO', 'Dra. Ríos'],
    ],
    'primero CESVI, después médico',
  )
  peritos = ponerPerito(peritos, perito('CESVI', 'Ing. Vera'))
  assert.deepEqual(
    peritos.map((p) => p.nombre),
    ['Ing. Vera', 'Dra. Ríos'],
  )
})
