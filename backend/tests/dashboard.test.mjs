import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import { crearRequerirSesion } from '../src/middlewares/autenticar.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { crearDashboardRouter } from '../src/modules/dashboard/dashboard.routes.ts'
import { crearServicioDashboard } from '../src/modules/dashboard/dashboard.service.ts'

const usuarios = Object.fromEntries(
  ['GESTOR', 'ADMINISTRADOR', 'SUPER_ADMINISTRADOR'].map((tipoUsuario, i) => [
    tipoUsuario,
    {
      id: i + 1,
      nombres: 'Prueba',
      apellidos: tipoUsuario,
      email: 'test@example.invalid',
      tipoUsuario,
    },
  ]),
)

test('dashboard HTTP: sesión y rol obligatorios; el actor sale de la cookie, no de parámetros', async (t) => {
  const llamadas = []
  const app = express()
  app.use(cookieParser())
  app.use(
    '/api/dashboard',
    crearDashboardRouter({
      requerirSesion: crearRequerirSesion({
        duracionMs: 1000,
        async validar(token) {
          return usuarios[token] ? { usuario: usuarios[token], renovada: false } : null
        },
      }),
      servicio: {
        async obtenerGestor(...args) {
          llamadas.push(args)
          return { ok: true }
        },
      },
    }),
  )
  app.use(errorHandler)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((ok) => server.once('listening', ok))
  t.after(() => new Promise((ok) => server.close(ok)))
  const pedir = (rol, query = '') =>
    fetch(`http://127.0.0.1:${server.address().port}/api/dashboard/gestor${query}`, {
      headers: rol ? { cookie: `cova_sesion=${rol}` } : {},
    })
  assert.equal((await pedir(null)).status, 401)
  assert.equal((await pedir('inventada')).status, 401)
  assert.equal((await pedir('ADMINISTRADOR')).status, 403)
  assert.equal((await pedir('SUPER_ADMINISTRADOR')).status, 403)
  assert.equal(llamadas.length, 0)
  const res = await pedir('GESTOR')
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.deepEqual(llamadas.pop(), [usuarios.GESTOR, 1])
  assert.equal((await pedir('GESTOR', '?paginaPericias=2')).status, 200)
  assert.deepEqual(llamadas.pop(), [usuarios.GESTOR, 2])
  for (const query of [
    '?idUsuario=2',
    '?gestor=2',
    '?paginaPericias=0',
    '?paginaPericias=1.5',
    '?paginaPericias[]=1',
    '?paginaPericias=',
  ]) {
    assert.equal((await pedir('GESTOR', query)).status, 400, query)
  }
  assert.equal(llamadas.length, 0)
})

test('dashboard servicio: no permite un actor administrador aunque se saltee el router', async () => {
  const servicio = crearServicioDashboard({
    transaccion() {
      throw new Error('No debe consultar')
    },
  })
  await assert.rejects(servicio.obtenerGestor(usuarios.ADMINISTRADOR, 1), { status: 403 })
})
