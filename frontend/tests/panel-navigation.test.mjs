import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canOpenSection,
  initialSection,
  navigationFor,
} from '../src/components/layout/panel-navigation.ts'

test('gestor: sólo siniestros, plantillas y perfil; bloquea direcciones administrativas', () => {
  assert.deepEqual(navigationFor('GESTOR'), ['siniestros', 'plantillas'])
  for (const path of ['siniestros', 'plantillas', 'perfil'])
    assert.equal(canOpenSection('GESTOR', path), true)
  for (const path of ['dashboard', 'aseguradoras', 'ajustadores', 'usuarios', 'informes'])
    assert.equal(canOpenSection('GESTOR', path), false)
  assert.equal(initialSection('GESTOR'), 'siniestros')
})

test('administrador y superadministrador tienen las seis secciones solicitadas y perfil', () => {
  const expected = [
    'dashboard',
    'siniestros',
    'aseguradoras',
    'ajustadores',
    'usuarios',
    'informes',
  ]
  for (const role of ['ADMINISTRADOR', 'SUPER_ADMINISTRADOR']) {
    assert.deepEqual(navigationFor(role), expected)
    for (const path of [...expected, 'perfil']) assert.equal(canOpenSection(role, path), true)
    assert.equal(canOpenSection(role, 'plantillas'), false)
    assert.equal(initialSection(role), 'dashboard')
  }
})

test('roles y rutas desconocidos no reciben acceso por defecto', () => {
  for (const role of ['', 'ADMIN', 'toString', '__proto__']) {
    assert.deepEqual(navigationFor(role), [])
    assert.equal(initialSection(role), null)
    assert.equal(canOpenSection(role, 'perfil'), false)
  }
  for (const path of ['', 'usuarios/editar', 'toString', '__proto__']) {
    assert.equal(canOpenSection('SUPER_ADMINISTRADOR', path), false)
    assert.equal(canOpenSection('GESTOR', path), false)
  }
})
