import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import { crearRequerirSesion } from '../src/middlewares/autenticar.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { crearSiniestrosRouter } from '../src/modules/siniestros/siniestros.routes.ts'
import { crearNotificacionesRouter } from '../src/modules/notificaciones/notificaciones.routes.ts'

test('HTTP: cambio de estado solo para administración y avisos ligados a la sesión', async (t) => {
  const actores = Object.fromEntries(
    ['GESTOR', 'ADMINISTRADOR', 'SUPER_ADMINISTRADOR'].map((tipoUsuario, i) => [
      tipoUsuario,
      {
        id: i + 1,
        tipoUsuario,
        nombres: tipoUsuario,
        apellidos: 'Prueba',
        email: 'test@example.invalid',
      },
    ]),
  )
  const llamadas = []
  const registrar =
    (accion) =>
    async (...args) => {
      llamadas.push([accion, ...args])
      return {}
    }
  const requerirSesion = crearRequerirSesion({
    duracionMs: 1000,
    validar: async (token) =>
      actores[token] ? { usuario: actores[token], renovada: false } : null,
  })
  const app = express()
  app.use(express.json(), cookieParser())
  app.use(
    '/api/siniestros',
    crearSiniestrosRouter({
      requerirSesion,
      estados: { opciones: registrar('opciones'), cambiar: registrar('cambiar') },
    }),
  )
  app.use(
    '/api/notificaciones',
    crearNotificacionesRouter({
      requerirSesion,
      servicio: { listar: registrar('listar'), leer: registrar('leer') },
    }),
  )
  app.use(errorHandler)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((ok) => server.once('listening', ok))
  t.after(() => new Promise((ok) => server.close(ok)))
  const pedir = (actor, ruta, method = 'GET', body) =>
    fetch(`http://127.0.0.1:${server.address().port}/api${ruta}`, {
      method,
      headers: {
        ...(actor ? { cookie: `cova_sesion=${actor}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  const cambio = { idEstadoAnterior: 1, idEstadoSiniestro: 2 }
  assert.equal((await pedir(null, '/siniestros/7/estados')).status, 401)
  for (const [ruta, metodo, body] of [
    ['/siniestros/7/estados', 'GET'],
    ['/siniestros/7/estado', 'PATCH', cambio],
  ]) {
    const respuesta = await pedir('GESTOR', ruta, metodo, body)
    assert.equal(respuesta.status, 403)
    assert.match((await respuesta.json()).error, /permiso/)
  }
  assert.equal(llamadas.length, 0)
  for (const rol of ['ADMINISTRADOR', 'SUPER_ADMINISTRADOR']) {
    const opciones = await pedir(rol, '/siniestros/7/estados')
    assert.equal(opciones.status, 200)
    assert.equal(opciones.headers.get('cache-control'), 'no-store')
    assert.deepEqual(llamadas.pop(), ['opciones', actores[rol], 7])
    assert.equal((await pedir(rol, '/siniestros/7/estado', 'PATCH', cambio)).status, 204)
    assert.deepEqual(llamadas.pop(), ['cambiar', actores[rol], 7, cambio])
  }
  for (const body of [
    {},
    { idEstadoSiniestro: 2 },
    { ...cambio, idEstadoSiniestro: -1 },
    { ...cambio, idUsuario: 9 },
    { ...cambio, fechaEvento: '2020-01-01' },
  ])
    assert.equal((await pedir('ADMINISTRADOR', '/siniestros/7/estado', 'PATCH', body)).status, 400)
  assert.equal(
    (await pedir('ADMINISTRADOR', '/siniestros/abc/estado', 'PATCH', cambio)).status,
    400,
  )
  assert.equal(llamadas.length, 0)
  assert.equal((await pedir(null, '/notificaciones')).status, 401)
  assert.equal((await pedir('GESTOR', '/notificaciones?pagina=2')).status, 200)
  assert.deepEqual(llamadas.pop(), ['listar', actores.GESTOR, 2])
  assert.equal((await pedir('GESTOR', '/notificaciones?idUsuario=2')).status, 400)
  assert.equal((await pedir('GESTOR', '/notificaciones?pagina=0')).status, 400)
  assert.equal(
    (await pedir('GESTOR', '/notificaciones/3/lectura', 'PATCH', { idUsuario: 2 })).status,
    400,
  )
  assert.equal((await pedir('GESTOR', '/notificaciones/3/lectura', 'PATCH')).status, 204)
  assert.deepEqual(llamadas.pop(), ['leer', actores.GESTOR, 3])
})
