import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import { crearSiniestrosRouter } from '../src/modules/siniestros/siniestros.routes.ts'
import { crearRequerirSesion } from '../src/middlewares/autenticar.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'

const actores = {
  admin: {
    id: 1,
    nombres: 'Ana',
    apellidos: 'Prueba',
    email: 'a@example.invalid',
    tipoUsuario: 'ADMINISTRADOR',
  },
  super: {
    id: 2,
    nombres: 'Julia',
    apellidos: 'Prueba',
    email: 's@example.invalid',
    tipoUsuario: 'SUPER_ADMINISTRADOR',
  },
  gestor: {
    id: 3,
    nombres: 'Pedro',
    apellidos: 'Prueba',
    email: 'g@example.invalid',
    tipoUsuario: 'GESTOR',
  },
}
test('HTTP baja y borrado: sesión, rol, id y confirmación estricta antes de ejecutar', async (t) => {
  const llamadas = []
  const app = express()
  app.use(express.json(), cookieParser())
  app.use(
    '/api/siniestros',
    crearSiniestrosRouter({
      servicio: {},
      operaciones: {
        darDeBaja: async (...args) => llamadas.push(['baja', ...args]),
        eliminar: async (...args) => llamadas.push(['eliminar', ...args]),
      },
      requerirSesion: crearRequerirSesion({
        duracionMs: 1000,
        validar: async (token) =>
          actores[token] ? { usuario: actores[token], renovada: false } : null,
      }),
    }),
  )
  app.use(errorHandler)
  const http = app.listen(0, '127.0.0.1')
  await new Promise((ok) => http.once('listening', ok))
  t.after(() => new Promise((ok) => http.close(ok)))
  const pedir = (quien, method, ruta, body) =>
    fetch(`http://127.0.0.1:${http.address().port}/api/siniestros${ruta}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(quien ? { cookie: `cova_sesion=${quien}` } : {}),
      },
      body: JSON.stringify(body),
    })
  for (const [method, ruta] of [
    ['PATCH', '/8/baja'],
    ['DELETE', '/8'],
  ]) {
    for (const [quien, status] of [
      [null, 401],
      ['inventada', 401],
      ['gestor', 403],
    ]) {
      assert.equal(
        (await pedir(quien, method, ruta, { numeroSiniestro: '2026-001' })).status,
        status,
      )
    }
    for (const body of [
      {},
      { numeroSiniestro: '' },
      { numeroSiniestro: ' ' },
      { numeroSiniestro: 'x'.repeat(256) },
      { numeroSiniestro: '2026-001', idUsuario: 999 },
      { numeroSiniestro: '2026-001', estado: 'Cierre enviado' },
    ]) {
      assert.equal((await pedir('admin', method, ruta, body)).status, 400)
    }
  }
  assert.equal(
    (await pedir('admin', 'DELETE', '/abc', { numeroSiniestro: '2026-001' })).status,
    400,
  )
  assert.equal(llamadas.length, 0)
  assert.equal(
    (await pedir('admin', 'PATCH', '/8/baja', { numeroSiniestro: ' 2026-001 ' })).status,
    204,
  )
  assert.equal((await pedir('super', 'DELETE', '/8', { numeroSiniestro: '2026-001' })).status, 204)
  assert.deepEqual(
    llamadas.map(([accion, actor, id, body]) => [accion, actor.id, id, body]),
    [
      ['baja', 1, 8, { numeroSiniestro: '2026-001' }],
      ['eliminar', 2, 8, { numeroSiniestro: '2026-001' }],
    ],
  )
})
