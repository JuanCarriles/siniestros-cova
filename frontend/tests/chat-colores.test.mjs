import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COLORES_PARTICIPANTES,
  coloresParticipantes,
} from '../src/features/siniestros/ficha/chat.ts'

const de = (...autores) =>
  autores.map((autor, i) => ({ id: i + 1, autor: { id: autor }, leidoPor: [] }))

test('chat: cada participante tiene un color propio, sin contar al usuario', () => {
  const colores = coloresParticipantes(de(3, 9, 3, 2, 9), 9)
  assert.equal(colores.has(9), false, 'el usuario usa su propio color')
  assert.deepEqual([...colores.keys()], [3, 2])
  assert.notEqual(colores.get(3), colores.get(2))
})

test('chat: parte del color que le toca por su id (el mismo en todos los siniestros si no choca)', () => {
  assert.equal(coloresParticipantes(de(8), 1).get(8), 8 % COLORES_PARTICIPANTES)
  // 1 y 7 piden el mismo color: el segundo en aparecer toma el siguiente libre
  const colores = coloresParticipantes(de(1, 7), 99)
  assert.equal(colores.get(1), 1)
  assert.equal(colores.get(7), 2)
})

test('chat: hasta seis personas nunca repiten color; un mensaje nuevo no le cambia el color a nadie', () => {
  const autores = [6, 12, 18, 24, 30, 36] // todos piden el color 0
  const colores = coloresParticipantes(de(...autores), 1)
  assert.equal(new Set(colores.values()).size, COLORES_PARTICIPANTES)
  const conOtro = coloresParticipantes(de(...autores, 4), 1)
  for (const a of autores) assert.equal(conOtro.get(a), colores.get(a))
  assert.ok(
    conOtro.get(4) >= 0 && conOtro.get(4) < COLORES_PARTICIPANTES,
    'el séptimo repite, pero tiene color',
  )
})
