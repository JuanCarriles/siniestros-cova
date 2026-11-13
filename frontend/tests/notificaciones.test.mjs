import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parametrosNotificaciones,
  queryNotificaciones,
  consultaNotificacionesSchema,
  marcarLecturaSchema,
  marcarRevisionSchema,
} from '../../shared/src/schemas/bandeja-notificaciones.ts'
import { canOpenSection } from '../src/components/layout/panel-navigation.ts'

test('notificaciones: filtros y paginación hacen ida y vuelta por URL sin perder revisión ni tipo', () => {
  const consulta = parametrosNotificaciones(
    new URLSearchParams('pagina=2&tipo=MENSAJE_NUEVO&revision=pendientes&lectura=sin-leer'),
  )
  assert.deepEqual(consulta, {
    pagina: 2,
    tipo: 'MENSAJE_NUEVO',
    revision: 'pendientes',
    lectura: 'sin-leer',
  })
  assert.deepEqual(
    parametrosNotificaciones(new URLSearchParams(queryNotificaciones(consulta))),
    consulta,
  )
  assert.equal(queryNotificaciones(consultaNotificacionesSchema.parse({})), '')
})
test('notificaciones: parámetros de pantalla desconocidos se descartan; la API rechaza los inválidos', () => {
  assert.deepEqual(
    parametrosNotificaciones(
      new URLSearchParams('pagina=-1&tipo=FALSO&revision=0&lectura=no&idUsuario=99'),
    ),
    { pagina: 1, lectura: 'todas', revision: 'todas' },
  )
  assert.equal(consultaNotificacionesSchema.safeParse({ idUsuario: 99 }).success, false)
  assert.equal(marcarRevisionSchema.safeParse({ revisada: 'true' }).success, false)
  assert.deepEqual(marcarLecturaSchema.parse({}), { leida: true })
})
test('notificaciones: los tres roles tienen acceso a su bandeja y los roles desconocidos no', () => {
  for (const rol of ['GESTOR', 'ADMINISTRADOR', 'SUPER_ADMINISTRADOR'])
    assert.equal(canOpenSection(rol, 'notificaciones'), true)
  for (const rol of ['ADMIN', '', '__proto__'])
    assert.equal(canOpenSection(rol, 'notificaciones'), false)
})
