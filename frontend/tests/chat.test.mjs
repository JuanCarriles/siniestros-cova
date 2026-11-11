import assert from 'node:assert/strict'
import test from 'node:test'
import { aplicarLecturas, hayPorLeer, unirMensajes } from '../src/features/siniestros/ficha/chat.ts'

const m = (id, fechaEnvio) => ({ id, fechaEnvio, texto: `m${id}`, leidoPor: [] })

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

const lector = (id, nombre) => ({ id, nombre, tipoUsuario: 'ADMINISTRADOR' })
const msj = (id, autor, leidoPor = []) => ({
  id,
  fechaEnvio: `2026-11-10T10:0${id}:00.000Z`,
  autor: { id: autor, nombre: `U${autor}`, tipoUsuario: 'GESTOR' },
  leidoPor,
})

// E7-03: la marca de leído llega por la respuesta y por el socket; un mensaje recargado trae sus lecturas
test('chat: lecturas sin repetir, sin contar al autor, y la versión más completa al recargar', () => {
  const ana = lector(7, 'Ana')
  const conversacion = [msj(1, 3), msj(2, 7), msj(3, 3)]
  const leidas = {
    idSiniestro: 1,
    idsMensajes: [1, 2, 3],
    lector: ana,
    fechaLeido: '2026-11-10T11:00:00.000Z',
  }
  const una = aplicarLecturas(conversacion, leidas)
  assert.deepEqual(
    una.map((m) => m.leidoPor.map((l) => l.lector.nombre)),
    [['Ana'], [], ['Ana']],
    'el autor no se cuenta como lector de su propio mensaje',
  )
  assert.equal(aplicarLecturas(una, leidas), una, 'la misma lectura dos veces no cambia nada')
  assert.equal(una[0].leidoPor[0].fechaLeido, '2026-11-10T11:00:00.000Z')

  assert.equal(hayPorLeer(conversacion, 7), true)
  assert.equal(hayPorLeer(una, 7), false)
  assert.equal(hayPorLeer(una, 3), true, 'el mensaje 2 (de Ana) sigue sin leer para el usuario 3')

  const recargado = unirMensajes(conversacion, [msj(1, 3, una[0].leidoPor)])
  assert.equal(recargado[0].leidoPor.length, 1)
  assert.equal(
    unirMensajes(recargado, [msj(1, 3)]),
    recargado,
    'una copia con menos lecturas no pisa',
  )
})
