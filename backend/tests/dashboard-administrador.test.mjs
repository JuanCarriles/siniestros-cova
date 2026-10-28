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

test('dashboard administrativo HTTP: permisos, filtros, asignación y actor de sesión', async (t) => {
  const llamadas = []
  const registrar =
    (nombre) =>
    async (...args) => {
      llamadas.push([nombre, ...args])
      return {}
    }
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
      servicio: { obtenerGestor: registrar('gestor') },
      administrador: {
        obtener: registrar('obtener'),
        gestores: registrar('gestores'),
        asignar: registrar('asignar'),
      },
    }),
  )
  app.use(errorHandler)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((ok) => server.once('listening', ok))
  t.after(() => new Promise((ok) => server.close(ok)))
  const pedir = (rol, ruta = '', body) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/dashboard/administrador${ruta}`, {
      method: body === undefined ? 'GET' : 'PATCH',
      headers: {
        ...(rol ? { cookie: `cova_sesion=${rol}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  for (const [ruta, body] of [
    ['', undefined],
    ['/gestores', undefined],
    ['/siniestros/5/gestor', { idUsuario: 3 }],
  ]) {
    assert.equal((await pedir(null, ruta, body)).status, 401)
    assert.equal((await pedir('GESTOR', ruta, body)).status, 403)
  }
  assert.equal(llamadas.length, 0)
  for (const rol of ['ADMINISTRADOR', 'SUPER_ADMINISTRADOR']) {
    const res = await pedir(rol)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.deepEqual(llamadas.pop(), ['obtener', usuarios[rol], { pagina: 1 }])
    assert.equal((await pedir(rol, '/gestores')).status, 200)
    assert.deepEqual(llamadas.pop(), ['gestores', usuarios[rol]])
    assert.equal((await pedir(rol, '/siniestros/5/gestor', { idUsuario: 3 })).status, 204)
    assert.deepEqual(llamadas.pop(), ['asignar', usuarios[rol], 5, 3])
  }
  assert.equal((await pedir('ADMINISTRADOR', '?ver=sin-asignar&pagina=2')).status, 200)
  assert.deepEqual(llamadas.pop()[2], { ver: 'sin-asignar', pagina: 2 })
  for (const ruta of ['?ver=otra', '?pagina=0', '?pagina=1.2', '?idUsuario=2', '?ver[]=actividad'])
    assert.equal((await pedir('ADMINISTRADOR', ruta)).status, 400)
  for (const body of [
    {},
    { idUsuario: 0 },
    { idUsuario: 2, actor: 1 },
    { idUsuario: 3, tipoUsuario: 'SUPER_ADMINISTRADOR' },
  ])
    assert.equal((await pedir('ADMINISTRADOR', '/siniestros/5/gestor', body)).status, 400)
  assert.equal(
    (await pedir('ADMINISTRADOR', '/siniestros/abc/gestor', { idUsuario: 3 })).status,
    400,
  )
  assert.equal(llamadas.length, 0)
})

test('el servicio también rechaza gestores sin consultar la base', async () => {
  const fallo = () => {
    throw new Error('No debe consultar')
  }
  const servicio = crearServicioDashboardAdministrador({ lectura: fallo, transaccion: fallo })
  await assert.rejects(servicio.obtener(usuarios.GESTOR, { pagina: 1 }), { status: 403 })
  await assert.rejects(servicio.gestores(usuarios.GESTOR), { status: 403 })
  await assert.rejects(servicio.asignar(usuarios.GESTOR, 1, 2), { status: 403 })
})
