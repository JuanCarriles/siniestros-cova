import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aplicarLecturas,
  hayPorLeer,
  idsPorLeer,
  unirMensajes,
} from '../src/features/siniestros/ficha/chat.ts'

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

// E7-03: dos copias del mismo mensaje con lectores distintos (una llegó por el socket, otra al recargar después de un
// corte): se juntan, no se elige la que tiene más
test('chat: se juntan los lectores de las dos copias de un mensaje', () => {
  const ana = { lector: lector(7, 'Ana'), fechaLeido: '2026-11-10T11:05:00.000Z' }
  const bruno = { lector: lector(8, 'Bruno'), fechaLeido: '2026-11-10T11:00:00.000Z' }
  const local = [msj(1, 3, [ana])]
  const unida = unirMensajes(local, [msj(1, 3, [bruno])])
  assert.deepEqual(
    unida[0].leidoPor.map((l) => l.lector.nombre),
    ['Bruno', 'Ana'],
    'los dos, de la primera lectura a la última',
  )
  // El mismo lector en las dos copias: queda una sola vez, con la lectura guardada primero
  const anaDespues = { ...ana, fechaLeido: '2026-11-10T11:30:00.000Z' }
  assert.equal(unirMensajes(unida, [msj(1, 3, [anaDespues, bruno])]), unida, 'nada nuevo')
  // Una lectura que llega por el socket se ordena con las demás
  const conCarla = aplicarLecturas(unida, {
    idSiniestro: 1,
    idsMensajes: [1],
    lector: lector(9, 'Carla'),
    fechaLeido: '2026-11-10T11:02:00.000Z',
  })
  assert.deepEqual(
    conCarla[0].leidoPor.map((l) => l.lector.nombre),
    ['Bruno', 'Carla', 'Ana'],
  )
})

test('chat: idsPorLeer cambia con el conjunto de pendientes, no solo entre hay y no hay', () => {
  const ana = { lector: lector(7, 'Ana'), fechaLeido: '2026-11-10T11:00:00.000Z' }
  assert.equal(idsPorLeer([msj(1, 3), msj(2, 7), msj(3, 3, [ana])], 7), '1')
  assert.equal(idsPorLeer([msj(1, 3), msj(2, 3)], 7), '1,2')
  assert.equal(idsPorLeer([msj(2, 7)], 7), '', 'los propios no cuentan')
})
