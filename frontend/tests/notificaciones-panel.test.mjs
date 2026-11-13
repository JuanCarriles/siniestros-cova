import test from 'node:test'
import assert from 'node:assert/strict'
import { combinarAvisosVisibles } from '../src/features/notificaciones/avisos-visibles.ts'

test('El panel incorpora avisos y actualiza agrupados sin perder los que ya mostró y marcó leídos', () => {
  const primero = { id: 1, fecha: '2026-11-13T12:00:00Z', leida: true, mensaje: 'Primero' }
  const grupo = { id: 2, fecha: '2026-11-13T12:01:00Z', leida: true, mensaje: '1 mensaje' }
  const nuevo = { id: 3, fecha: '2026-11-13T12:02:00Z', leida: true, mensaje: 'Nuevo' }
  const actualizado = { ...grupo, fecha: '2026-11-13T12:03:00Z', mensaje: '2 mensajes' }
  const resultado = combinarAvisosVisibles([grupo, primero], [nuevo, actualizado])
  assert.deepEqual(resultado, [actualizado, nuevo, primero])
  assert.equal(resultado.filter((x) => x.id === grupo.id).length, 1)
  assert.deepEqual(combinarAvisosVisibles(resultado, []), resultado)
})
