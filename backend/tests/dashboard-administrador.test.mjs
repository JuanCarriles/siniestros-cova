import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import { crearRequerirSesion } from '../src/middlewares/autenticar.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { crearDashboardRouter } from '../src/modules/dashboard/dashboard.routes.ts'
import { crearServicioDashboardAdministrador } from '../src/modules/dashboard/dashboard-administrador.service.ts'

const usuarios = Object.fromEntries(
  ['GESTOR', 'ADMINISTRADOR', 'SUPER_ADMINISTRADOR'].map((tipoUsuario, i) => [
    tipoUsuario,
    {
      id: i + 1,
      nombres: 'Prueba',
      apellidos: 'Dashboard',
      email: 'test@example.invalid',
      tipoUsuario,
    },
  ]),
)
test('dashboard administrativo: sesión, roles, filtros y retiro de la asignación', async (t) => {
  const llamadas = []
  const app = express()
  app.use(express.json(), cookieParser())
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
        async obtenerGestor() {
          return {}
        },
      },
      administrador: {
        async obtener(...args) {
          llamadas.push(args)
          return {}
        },
      },
    }),
  )
  app.use(errorHandler)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((ok) => server.once('listening', ok))
  t.after(() => new Promise((ok) => server.close(ok)))
  const pedir = (rol, ruta = '', method = 'GET') =>
    fetch(`http://127.0.0.1:${server.address().port}/api/dashboard/administrador${ruta}`, {
      method,
      headers: rol ? { cookie: `cova_sesion=${rol}` } : {},
    })
  assert.equal((await pedir(null)).status, 401)
  assert.equal((await pedir('GESTOR')).status, 403)
  assert.equal(llamadas.length, 0)
  for (const rol of ['ADMINISTRADOR', 'SUPER_ADMINISTRADOR']) {
    const res = await pedir(rol)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.deepEqual(llamadas.pop(), [usuarios[rol], { pagina: 1 }])
  }
  assert.equal((await pedir('ADMINISTRADOR', '?ver=actividad&pagina=2')).status, 200)
  assert.deepEqual(llamadas.pop()[1], { ver: 'actividad', pagina: 2 })
  for (const ruta of [
    '?ver=sin-asignar',
    '?pagina=0',
    '?pagina=1.2',
    '?idUsuario=2',
    '?ver[]=actividad',
  ])
    assert.equal((await pedir('ADMINISTRADOR', ruta)).status, 400)
  assert.equal((await pedir('ADMINISTRADOR', '/gestores')).status, 404)
  assert.equal((await pedir('ADMINISTRADOR', '/siniestros/1/gestor', 'PATCH')).status, 404)
  assert.equal(llamadas.length, 0)
})
test('el servicio también rechaza al gestor sin consultar la base', async () => {
  const servicio = crearServicioDashboardAdministrador({
    lectura() {
      throw new Error('No debe consultar')
    },
  })
  await assert.rejects(servicio.obtener(usuarios.GESTOR, { pagina: 1 }), { status: 403 })
})
