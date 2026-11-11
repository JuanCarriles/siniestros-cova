import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import {
  crearMarcadoLeido,
  esperaReintento,
  ESPERA_MARCADO_MS,
} from '../src/features/siniestros/ficha/marcado-leido.ts'

// E7-03: cuándo se pide marcar la conversación como leída (lo usa useConversacion). Con relojes simulados.

/** Deja correr las promesas resueltas (los setTimeout están simulados; setImmediate no) */
const drenar = () => new Promise((ok) => setImmediate(ok))

function preparar(t) {
  mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => mock.timers.reset())
  // Un servidor de mentira: cada pedido queda pendiente hasta resolverlo o rechazarlo desde la prueba
  const pedidos = []
  const marcados = []
  const marcado = crearMarcadoLeido({
    marcar: () => new Promise((resolver, rechazar) => pedidos.push({ resolver, rechazar })),
    alMarcar: (r) => marcados.push(r),
  })
  return { pedidos, marcados, marcado, avanzar: (ms) => mock.timers.tick(ms) }
}

test('marcado: al entrar se marca una vez, aunque no haya nada pendiente', async (t) => {
  const { pedidos, marcado, avanzar } = preparar(t)
  marcado.actualizar({ activo: true, porLeer: '' })
  avanzar(ESPERA_MARCADO_MS)
  assert.equal(pedidos.length, 1, 'retira un aviso que haya quedado')
  pedidos[0].resolver('ok')
  await drenar()
  marcado.actualizar({ activo: true, porLeer: '' })
  avanzar(10_000)
  assert.equal(pedidos.length, 1, 'sin pendientes, no vuelve a pedir')
})

test('marcado: lo que llega mientras hay un pedido en curso se marca después', async (t) => {
  const { pedidos, marcados, marcado, avanzar } = preparar(t)
  marcado.actualizar({ activo: true, porLeer: '1' })
  avanzar(ESPERA_MARCADO_MS)
  assert.equal(pedidos.length, 1)
  // Llega el mensaje 2 mientras el pedido del 1 está en curso: no se pide en paralelo
  marcado.actualizar({ activo: true, porLeer: '1,2' })
  avanzar(ESPERA_MARCADO_MS)
  assert.equal(pedidos.length, 1, 'un pedido por vez')
  // El servidor marcó solo el 1; el 2 sigue pendiente: hay otra pasada
  pedidos[0].resolver('marcó el 1')
  await drenar()
  assert.deepEqual(marcados, ['marcó el 1'])
  marcado.actualizar({ activo: true, porLeer: '2' })
  avanzar(ESPERA_MARCADO_MS)
  assert.equal(pedidos.length, 2, 'el mensaje que llegó durante el pedido también se marca')
  pedidos[1].resolver('marcó el 2')
  await drenar()
  marcado.actualizar({ activo: true, porLeer: '' })
  avanzar(10_000)
  assert.equal(pedidos.length, 2)
})

test('marcado: si falla, reintenta solo con espera creciente', async (t) => {
  const { pedidos, marcados, marcado, avanzar } = preparar(t)
  marcado.actualizar({ activo: true, porLeer: '1' })
  avanzar(ESPERA_MARCADO_MS)
  pedidos[0].rechazar(new Error('sin red'))
  await drenar()
  // Aunque no llegue nada nuevo (el conjunto sigue igual), vuelve a intentar
  avanzar(esperaReintento(1) - 1)
  assert.equal(pedidos.length, 1)
  avanzar(1)
  assert.equal(pedidos.length, 2, 'primer reintento a 1 s')
  pedidos[1].rechazar(new Error('sin red'))
  await drenar()
  avanzar(esperaReintento(2) - 1)
  assert.equal(pedidos.length, 2)
  avanzar(1)
  assert.equal(pedidos.length, 3, 'segundo reintento a 2 s')
  pedidos[2].resolver('ok')
  await drenar()
  assert.deepEqual(marcados, ['ok'])
  assert.equal(esperaReintento(20), 30_000, 'nunca espera más de 30 s')
})

test('marcado: con la pestaña oculta no marca; al volver, sí', (t) => {
  const { pedidos, marcado, avanzar } = preparar(t)
  marcado.actualizar({ activo: false, porLeer: '1' })
  avanzar(10_000)
  assert.equal(pedidos.length, 0)
  marcado.actualizar({ activo: true, porLeer: '1' })
  avanzar(ESPERA_MARCADO_MS)
  assert.equal(pedidos.length, 1)
})

test('marcado: si el servidor no tenía nada que marcar, no insiste con lo mismo', async (t) => {
  const { pedidos, marcado, avanzar } = preparar(t)
  marcado.actualizar({ activo: true, porLeer: '1' })
  avanzar(ESPERA_MARCADO_MS)
  // Otra pestaña ya lo había marcado y se perdió ese aviso: localmente sigue figurando sin leer
  pedidos[0].resolver('nada')
  await drenar()
  marcado.actualizar({ activo: true, porLeer: '1' })
  avanzar(10_000)
  assert.equal(pedidos.length, 1, 'no queda pidiendo en bucle')
  marcado.actualizar({ activo: true, porLeer: '1,2' })
  avanzar(ESPERA_MARCADO_MS)
  assert.equal(pedidos.length, 2, 'con un mensaje nuevo, vuelve a marcar')
})

test('marcado: al salir de la conversación no pide ni reintenta', async (t) => {
  const { pedidos, marcado, avanzar } = preparar(t)
  marcado.actualizar({ activo: true, porLeer: '1' })
  avanzar(ESPERA_MARCADO_MS)
  pedidos[0].rechazar(new Error('sin red'))
  await drenar()
  marcado.cerrar()
  avanzar(60_000)
  assert.equal(pedidos.length, 1)
})
