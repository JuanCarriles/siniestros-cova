import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import { perfilDatosSchema, perfilActualizacionSchema } from '@cova/shared/schemas/perfil'
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
const actualizado = { ...valido, contrasenaActual: 'Inicial.2026' }

test('Zod: lista blanca y contraseña actual obligatoria en la escritura', () => {
  assert.equal(perfilDatosSchema.parse(valido).email, 'ana@example.test')
  assert.equal(perfilActualizacionSchema.safeParse(valido).success, false)
  assert.equal(
    perfilActualizacionSchema.safeParse({ ...actualizado, contrasenaActual: '' }).success,
    false,
  )
  for (const extra of [
    { id: 2 },
    { idUsuario: 2 },
    { tipoUsuario: 'SUPER_ADMINISTRADOR' },
    { eliminado: true },
    { fechaBaja: null },
    { casosActivos: 0 },
    { contrasena: 'Otra.2026' },
  ])
    assert.equal(perfilActualizacionSchema.safeParse({ ...actualizado, ...extra }).success, false)
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

test('API: identidad de sesión para todos los roles y escrituras estrictas', async (t) => {
  const { pedir, llamadas } = await servidor(t)
  assert.equal((await pedir(null)).status, 401)
  for (const rol of ['GESTOR', 'ADMINISTRADOR', 'SUPER_ADMINISTRADOR']) {
    const r = await pedir(rol, '?id=999')
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('cache-control'), 'no-store')
    assert.equal((await r.json()).id, 7)
    assert.equal((await pedir(rol, '/catalogos')).status, 200)
  }
  assert.equal((await pedir('GESTOR', '/999')).status, 404)
  for (const body of [
    valido,
    { ...actualizado, tipoUsuario: 'SUPER_ADMINISTRADOR' },
    { ...actualizado, eliminado: true },
  ])
    assert.equal((await pedir('GESTOR', '', 'PATCH', body)).status, 400)
  assert.equal((await pedir('GESTOR', '', 'PATCH', actualizado)).status, 204)
  const llamada = llamadas.at(-1)
  assert.deepEqual(llamada.slice(0, 3), ['modificar', 7, 'sesion-actual'])
  assert.equal(llamada[3].contrasenaActual, 'Inicial.2026')
  assert.equal(typeof llamada[4], 'string', 'el límite recibe la IP del servidor')
})

test('API: verificar no entrega permisos; cambio exige actual y nueva confirmada; bloquear ya no existe', async (t) => {
  const { pedir, llamadas } = await servidor(t)
  assert.equal(
    (await pedir(null, '/verificar', 'POST', { contrasena: 'Inicial.2026' })).status,
    401,
  )
  for (const body of [
    { contrasena: '' },
    { contrasena: 'Inicial.2026', idUsuario: 99 },
    { contrasena: 'Inicial.2026', alcance: 'datos' },
  ])
    assert.equal((await pedir('GESTOR', '/verificar', 'POST', body)).status, 400)
  const r = await pedir('GESTOR', '/verificar', 'POST', { contrasena: 'Inicial.2026' })
  assert.equal(r.status, 204)
  assert.equal(await r.text(), '')
  assert.equal((await pedir('GESTOR', '/bloquear', 'POST')).status, 404)
  const nueva = {
    contrasena: 'Nueva.2026',
    confirmarContrasena: 'Nueva.2026',
    contrasenaActual: 'Inicial.2026',
  }
  for (const body of [
    { contrasena: nueva.contrasena, confirmarContrasena: nueva.confirmarContrasena },
    { ...nueva, confirmarContrasena: 'Otra.2026' },
    { ...nueva, contrasena: 'insegura', confirmarContrasena: 'insegura' },
  ])
    assert.equal((await pedir('GESTOR', '/contrasena', 'PATCH', body)).status, 400)
  assert.equal((await pedir('GESTOR', '/contrasena', 'PATCH', nueva)).status, 204)
  assert.deepEqual(llamadas.at(-1).slice(0, 4), ['cambiarContrasena', 7, 'sesion-actual', nueva])
})
