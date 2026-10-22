import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import { perfilDatosSchema, perfilActualizacionSchema } from '@cova/shared/schemas/perfil'
import { crearServicioPerfil } from '../src/modules/perfil/perfil.service.ts'
import { crearCorreoCambioContrasena } from '../src/lib/correo-cambio-contrasena.ts'
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
        return nombre === 'cambiarContrasena' ? { correoEnviado: true } : { id: args[0] }
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
    ...['Corta1', 'sinmayuscula1', 'SinNumeros', 'A1' + 'x'.repeat(127)].map((contrasena) => ({
      ...nueva,
      contrasena,
      confirmarContrasena: contrasena,
    })),
  ]) {
    const rechazado = await pedir('GESTOR', '/contrasena', 'PATCH', body)
    assert.equal(rechazado.status, 400)
    assert.equal(rechazado.headers.get('set-cookie'), null, 'un rechazo no cierra la sesión')
  }
  assert.equal(llamadas.filter(([nombre]) => nombre === 'cambiarContrasena').length, 0)
  const cambiado = await pedir('GESTOR', '/contrasena', 'PATCH', nueva)
  assert.equal(cambiado.status, 200)
  assert.deepEqual(await cambiado.json(), { correoEnviado: true })
  assert.match(cambiado.headers.get('set-cookie'), /cova_sesion=;.*Expires=Thu, 01 Jan 1970/)
  assert.match(cambiado.headers.get('set-cookie'), /HttpOnly/i)
  assert.deepEqual(llamadas.at(-1).slice(0, 4), ['cambiarContrasena', 7, 'sesion-actual', nueva])
})

test('un fallo de la transacción no envía un aviso de cambio', async () => {
  let enviados = 0
  const error = new Error('falló el commit')
  const servicio = crearServicioPerfil({
    base: {
      transaccion: async () => {
        throw error
      },
    },
    enviarAvisoCambio: async () => {
      enviados++
    },
  })
  await assert.rejects(
    servicio.cambiarContrasena(7, 'token', {
      contrasenaActual: 'Inicial.2026',
      contrasena: 'Nueva.2026',
      confirmarContrasena: 'Nueva.2026',
    }),
    (e) => e === error,
  )
  assert.equal(enviados, 0)
})

test('Resend: aviso al correo de la cuenta, HTML y texto, sin contraseñas ni datos privados del proveedor', async (t) => {
  let pedido
  t.mock.method(globalThis, 'fetch', async (url, opciones) => {
    pedido = { url, ...opciones }
    return new Response('{}', { status: 200 })
  })
  const config = { apiKey: 'clave-ficticia', remitente: 'Estudio Cova <seguridad@example.test>' }
  const enviar = crearCorreoCambioContrasena(config)
  await enviar('usuario@example.test')
  assert.equal(pedido.url, 'https://api.resend.com/emails')
  assert.equal(pedido.headers.Authorization, 'Bearer clave-ficticia')
  const body = JSON.parse(pedido.body)
  assert.deepEqual(body.to, ['usuario@example.test'])
  assert.equal(body.from, config.remitente)
  assert.match(body.html, /Tu contraseña cambió/)
  assert.match(body.html, /max-width:560px/)
  assert.match(body.text, /todas tus sesiones/)
  assert.match(body.text, /Si no hiciste este cambio/)
  for (const valor of ['Inicial.2026', 'Nueva.2026', config.apiKey]) {
    assert.equal(body.text.includes(valor), false)
    assert.equal(body.html.includes(valor), false)
  }
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('información privada', { status: 403 }),
  )
  await assert.rejects(enviar('usuario@example.test'), { message: 'Resend rechazó el envío (403)' })
  await assert.rejects(
    crearCorreoCambioContrasena({ remitente: config.remitente })('usuario@example.test'),
    {
      message: 'RESEND_API_KEY no configurada',
    },
  )
})
