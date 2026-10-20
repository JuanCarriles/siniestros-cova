import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import { usuarioAltaSchema, usuarioModificacionSchema } from '@cova/shared/schemas/usuarios-abm'
import { crearUsuariosRouter } from '../src/modules/usuarios/usuarios.routes.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'

const datos = {
  nombres: ' Ana ',
  apellidos: 'Prueba',
  documento: '123',
  telefono: '11 1234',
  email: 'ANA@Ejemplo.Test',
  tipoUsuario: 'GESTOR',
  contrasena: 'Prueba.2026',
  direccion: { idProvincia: '1', localidad: 'Rosario' },
}

test('Zod: alta fuerte, datos normalizados, contrato estricto y contraseña opcional al modificar', () => {
  const valido = usuarioAltaSchema.parse(datos)
  assert.equal(valido.email, 'ana@ejemplo.test')
  assert.equal(valido.nombres, 'Ana')
  assert.equal(valido.direccion.idProvincia, 1)
  for (const contrasena of ['', 'corta', 'sinmayuscula123', 'SinNumeros'])
    assert.equal(usuarioAltaSchema.safeParse({ ...datos, contrasena }).success, false)
  for (const agregado of [
    { eliminado: true },
    { id: 9 },
    { idDireccion: 9 },
    { ultimaConexion: new Date().toISOString() },
  ])
    assert.equal(usuarioAltaSchema.safeParse({ ...datos, ...agregado }).success, false)
  assert.equal(
    usuarioModificacionSchema.safeParse({ nombres: 'Ana', contrasena: '' }).success,
    true,
  )
  assert.equal(usuarioModificacionSchema.safeParse({ nombres: 'Ana' }).success, true)
  assert.equal(usuarioModificacionSchema.safeParse({ contrasena: '' }).success, false)
  assert.equal(usuarioModificacionSchema.safeParse({}).success, false)
  assert.equal(usuarioModificacionSchema.safeParse({ contrasena: 'insegura' }).success, false)
})

async function servidor(t) {
  const llamadas = []
  const servicio = Object.fromEntries(
    ['listar', 'catalogos', 'crear', 'modificar', 'darDeBaja', 'reactivar'].map((nombre) => [
      nombre,
      async (...args) => {
        llamadas.push([nombre, ...args])
        return nombre === 'listar' ? [] : { id: 1 }
      },
    ]),
  )
  const app = express()
  app.use(express.json())
  app.use(
    '/api/usuarios',
    crearUsuariosRouter({
      servicio,
      requerirSesion: (req, res, next) => {
        const rol = req.get('x-test-role')
        if (!rol) return res.status(401).end()
        req.usuario = {
          id: 21,
          nombres: 'Actor',
          apellidos: 'Prueba',
          email: 'actor@ejemplo.test',
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
  const pedir = (rol, ruta = '', method = 'GET', body) =>
    fetch(`http://127.0.0.1:${http.address().port}/api/usuarios${ruta}`, {
      method,
      headers: { 'content-type': 'application/json', ...(rol ? { 'x-test-role': rol } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  return { pedir, llamadas }
}

test('API: exige sesión y rol también para catálogos y escrituras', async (t) => {
  const { pedir, llamadas } = await servidor(t)
  for (const [rol, status] of [
    [null, 401],
    ['GESTOR', 403],
  ]) {
    for (const [ruta, method, body] of [
      ['', 'GET'],
      ['/catalogos', 'GET'],
      ['', 'POST', datos],
      ['/1', 'PATCH', { nombres: 'Otro' }],
      ['/1/baja', 'PATCH'],
      ['/1/reactivacion', 'PATCH'],
    ])
      assert.equal((await pedir(rol, ruta, method, body)).status, status)
  }
  assert.equal(llamadas.length, 0)
  for (const rol of ['ADMINISTRADOR', 'SUPER_ADMINISTRADOR'])
    assert.equal((await pedir(rol)).status, 200)
})

test('API: valida entradas y pasa al servicio el actor de la sesión, sin aceptar privilegios del body', async (t) => {
  const { pedir, llamadas } = await servidor(t)
  assert.equal((await pedir('ADMINISTRADOR', '', 'POST', datos)).status, 201)
  const alta = llamadas.pop()
  assert.equal(alta[0], 'crear')
  assert.equal(alta[1].id, 21)
  assert.equal(alta[2].email, 'ana@ejemplo.test')
  assert.equal((await pedir('ADMINISTRADOR', '?incluirBajas=si')).status, 400)
  assert.equal((await pedir('ADMINISTRADOR', '/abc/baja', 'PATCH')).status, 400)
  assert.equal((await pedir('ADMINISTRADOR', '/1', 'PATCH', {})).status, 400)
  assert.equal(
    (
      await pedir('ADMINISTRADOR', '', 'POST', {
        ...datos,
        actor: { tipoUsuario: 'SUPER_ADMINISTRADOR' },
      })
    ).status,
    400,
  )
  assert.equal(
    (await pedir('ADMINISTRADOR', '/1', 'PATCH', { nombres: 'Otro', contrasena: '' })).status,
    200,
  )
  assert.equal(llamadas.at(-1)[3].contrasena, '')
})
