import assert from 'node:assert/strict'
import test from 'node:test'
import { esFallaDeConexion, lineaDeTiempo } from '../src/features/siniestros/ficha/chat.ts'
import { debeSonar, SONAR_CADA_MS } from '../src/lib/sonido-mensajes.ts'

const msj = (id, autor = 7) => ({
  id,
  fechaEnvio: `2026-11-13T10:0${id}:00.000Z`,
  autor: { id: autor, nombre: `U${autor}`, tipoUsuario: 'GESTOR' },
  leidoPor: [],
})
const pend = (clave, despuesDe) => ({ claveEnvio: clave, texto: clave, despuesDe })
const orden = (elementos) =>
  elementos.map((e) => (e.tipo === 'mensaje' ? e.mensaje.id : e.pendiente.claveEnvio))

// Un mensaje que no se pudo enviar queda donde se escribió: lo que llega después aparece debajo, a la vista
test('chat: los envíos sin confirmar quedan en su lugar de la conversación', () => {
  // Escribí "a" con la conversación en el mensaje 2; sin conexión, llegaron el 3 y el 4 de otro
  assert.deepEqual(orden(lineaDeTiempo([msj(1), msj(2), msj(3), msj(4)], [pend('a', 2)])), [
    1,
    2,
    'a',
    3,
    4,
  ])
  // Varios seguidos, en el orden en que se escribieron
  assert.deepEqual(orden(lineaDeTiempo([msj(1), msj(2)], [pend('a', 1), pend('b', 1)])), [
    1,
    'a',
    'b',
    2,
  ])
  assert.deepEqual(
    orden(lineaDeTiempo([msj(1)], [pend('a', null)])),
    ['a', 1],
    'con la conversación vacía, va primero',
  )
  assert.deepEqual(
    orden(lineaDeTiempo([msj(1)], [pend('a', 99)])),
    [1, 'a'],
    'sin su referencia, al final',
  )
  assert.deepEqual(orden(lineaDeTiempo([msj(1)], [])), [1])
})

test('chat: solo se reenvía solo lo que falló por la conexión o el servidor', () => {
  for (const status of [undefined, 0, 408, 429, 500, 502, 503])
    assert.equal(esFallaDeConexion(status), true, String(status))
  for (const status of [400, 401, 403, 404, 409, 413])
    assert.equal(esFallaDeConexion(status), false, String(status))
})

test('sonido: varios mensajes seguidos suenan una vez, y nada si está silenciado', () => {
  assert.equal(debeSonar(Number.NEGATIVE_INFINITY, 0, true), true, 'el primero suena')
  assert.equal(debeSonar(1_000, 1_000 + SONAR_CADA_MS - 1, true), false, 'una ráfaga no repite')
  assert.equal(debeSonar(1_000, 1_000 + SONAR_CADA_MS, true), true)
  assert.equal(debeSonar(Number.NEGATIVE_INFINITY, 0, false), false, 'silenciado')
})
