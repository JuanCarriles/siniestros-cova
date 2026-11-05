import assert from 'node:assert/strict'
import test from 'node:test'
import { DIAS_ALERTA, DIAS_DEMORADO, tonoDemora } from '@cova/shared/schemas/siniestros'

// RF-19 (E5-10): el semáforo de días sin movimiento, el mismo en el listado, las tarjetas y la cabecera de la ficha
test('semáforo de demora: amarillo desde 72 horas, rojo desde 7 días; cerrados y dados de baja sin marcar', () => {
  assert.equal(tonoDemora(DIAS_DEMORADO - 1, false), 'normal')
  assert.equal(tonoDemora(DIAS_DEMORADO, false), 'demorado')
  assert.equal(tonoDemora(DIAS_ALERTA - 1, false), 'demorado')
  assert.equal(tonoDemora(DIAS_ALERTA, false), 'alerta')
  assert.equal(tonoDemora(20, true), 'normal', 'un caso cerrado ya no se mueve')
  assert.equal(tonoDemora(20, false, true), 'normal', 'uno dado de baja tampoco')
})
