import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import { perfilDatosSchema } from '@cova/shared/schemas/perfil'
import { crearPerfilRouter } from '../src/modules/perfil/perfil.routes.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'

const valido = {
  nombres: ' Ana ',
  apellidos: 'Prueba',
  documento: '123',
  email: 'ANA@Example.Test',
  telefono: '11 1234',
  direccion: { idProvincia: '1', localidad: 'Rosario' },
}
test('Zod de perfil: lista blanca sin identidad, rol, estado ni contraseña', () => {
  assert.equal(perfilDatosSchema.parse(valido).email, 'ana@example.test')
  for (const extra of [
    { id: 2 },
    { idUsuario: 2 },
    { tipoUsuario: 'SUPER_ADMINISTRADOR' },
    { eliminado: true },
    { fechaBaja: null },
    { casosActivos: 0 },
    { contrasena: 'Otra.2026' },
  ])
    assert.equal(perfilDatosSchema.safeParse({ ...valido, ...extra }).success, false)
})

async function servidor(t) {
  const llamadas = []
  const servicio = Object.fromEntries(
    ['obtener', 'catalogos', 'verificar', 'modificar', 'cambiarContrasena'].map((nombre) => [
      nombre,
      async (...args) => {
        llamadas.push([nombre, ...args])
        return { id: args[0] }
      },
    ]),
  )
  servicio.bloquear = (...args) => llamadas.push(['bloquear', ...args])
  const app = express()
  app.use(express.json(), cookieParser())
  app.use(
    '/api/perfil',
    crearPerfilRouter({
      servicio,
      requerirSesion: (req, res, next) => {
        const rol = req.get('x-test-role')
        if (!rol) return res.status(401).end()
        req.usuario = {
          id: 7,
          nombres: 'Actor',
          apellidos: 'Prueba',
          email: 'actor@example.test',
          tipoUsuario: rol,
        }
        next()
      },
    }),
  )
  app.use(errorHandler)
  const http = app.listen(0, '127.0.0.1')
  await new Promise((ok) => http.once('listening', ok))
  t.after(() => new Promise((ok) => http.close(ok)))
  const pedir = (rol, path = '', method = 'GET', body) =>
    fetch(`http://127.0.0.1:${http.address().port}/api/perfil${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(rol ? { 'x-test-role': rol, cookie: 'cova_sesion=sesion-actual' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  return { pedir, llamadas }
}
test('API: perfil propio para los tres roles; usa la sesión y no acepta id ajeno', async (t) => {
  const { pedir, llamadas } = await servidor(t)
  assert.equal((await pedir(null)).status, 401)
  for (const rol of ['GESTOR', 'ADMINISTRADOR', 'SUPER_ADMINISTRADOR']) {
    const respuesta = await pedir(rol, '?id=999')
    assert.equal(respuesta.status, 200)
    assert.equal(respuesta.headers.get('cache-control'), 'no-store')
    assert.equal((await respuesta.json()).id, 7)
    assert.equal((await pedir(rol, '/catalogos')).status, 200)
  }
  assert.equal((await pedir('GESTOR', '/999')).status, 404)
  assert.equal(
    (await pedir('GESTOR', '', 'PATCH', { ...valido, tipoUsuario: 'SUPER_ADMINISTRADOR' })).status,
    400,
  )
  assert.equal((await pedir('GESTOR', '', 'PATCH', { ...valido, eliminado: true })).status, 400)
  assert.equal((await pedir('GESTOR', '', 'PATCH', valido)).status, 204)
  assert.deepEqual(llamadas.at(-1).slice(0, 3), ['modificar', 7, 'sesion-actual'])
})
test('API: verifica contraseña, permite cancelar y exige confirmación fuerte al cambiarla', async (t) => {
  const { pedir, llamadas } = await servidor(t)
  assert.equal(
    (await pedir(null, '/verificar', 'POST', { contrasena: 'Inicial.2026', alcance: 'datos' }))
      .status,
    401,
  )
  assert.equal(
    (await pedir('GESTOR', '/verificar', 'POST', { contrasena: '', alcance: 'datos' })).status,
    400,
  )
  assert.equal(
    (
      await pedir('GESTOR', '/verificar', 'POST', {
        contrasena: 'Inicial.2026',
        alcance: 'datos',
        idUsuario: 99,
      })
    ).status,
    400,
  )
  assert.equal(
    (await pedir('GESTOR', '/verificar', 'POST', { contrasena: 'Inicial.2026', alcance: 'datos' }))
      .status,
    200,
  )
  assert.equal((await pedir('GESTOR', '/bloquear', 'POST')).status, 204)
  assert.equal(
    (
      await pedir('GESTOR', '/contrasena', 'PATCH', {
        contrasena: 'Nueva.2026',
        confirmarContrasena: 'Otra.2026',
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await pedir('GESTOR', '/contrasena', 'PATCH', {
        contrasena: 'insegura',
        confirmarContrasena: 'insegura',
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await pedir('GESTOR', '/contrasena', 'PATCH', {
        contrasena: 'Nueva.2026',
        confirmarContrasena: 'Nueva.2026',
      })
    ).status,
    204,
  )
  assert.deepEqual(llamadas.at(-1), ['cambiarContrasena', 7, 'sesion-actual', 'Nueva.2026'])
})
