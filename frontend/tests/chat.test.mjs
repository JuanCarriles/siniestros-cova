import assert from 'node:assert/strict'
import test from 'node:test'
import { unirMensajes } from '../src/features/siniestros/ficha/chat.ts'

const m = (id, fechaEnvio) => ({ id, fechaEnvio, texto: `m${id}` })

// E7-02: un mensaje puede llegar por la respuesta del envío, por el socket y por la recuperación al reconectar
test('chat: la conversación queda del más viejo al más nuevo y sin repetidos', () => {
  const inicial = [m(1, '2026-11-10T10:00:00.000Z'), m(3, '2026-11-10T10:05:00.000Z')]
  assert.equal(unirMensajes(inicial, []), inicial)
  assert.equal(unirMensajes(inicial, [m(3, '2026-11-10T10:05:00.000Z')]), inicial, 'sin cambios')
  const unida = unirMensajes(inicial, [
    m(4, '2026-11-10T10:05:00.000Z'),
    m(2, '2026-11-10T10:02:00.000Z'),
    m(4, '2026-11-10T10:05:00.000Z'),
  ])
  assert.deepEqual(
    unida.map((x) => x.id),
    [1, 2, 3, 4],
  )
})
