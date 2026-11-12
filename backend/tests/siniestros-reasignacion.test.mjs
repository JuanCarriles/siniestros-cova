import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import { reasignarSiniestroSchema } from '@cova/shared/schemas/reasignacion-siniestro'
import { crearSiniestrosRouter } from '../src/modules/siniestros/siniestros.routes.ts'
import { crearRequerirSesion } from '../src/middlewares/autenticar.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { crearCorreoReasignacion } from '../src/lib/correo-reasignacion.ts'

test('reasignación: contrato estricto y confirmación explícita', () => {
  const valido = { idUsuarioAnterior: 1, idUsuarioNuevo: 2, confirmado: true }
  assert.deepEqual(reasignarSiniestroSchema.parse(valido), valido)
  for (const body of [
    { ...valido, confirmado: false },
    { ...valido, confirmado: undefined },
    { ...valido, idUsuario: 99 },
    { ...valido, fecha: new Date().toISOString() },
    { ...valido, idUsuarioNuevo: 0 },
  ])
    assert.equal(reasignarSiniestroSchema.safeParse(body).success, false)
})

test('HTTP: sesión, roles, id, confirmación y autor tomado de la sesión', async (t) => {
  const actores = {
    admin: { id: 1, tipoUsuario: 'ADMINISTRADOR' },
    super: { id: 2, tipoUsuario: 'SUPER_ADMINISTRADOR' },
    gestor: { id: 3, tipoUsuario: 'GESTOR' },
  }
  const llamadas = []
  const router = crearSiniestrosRouter({
    requerirSesion: crearRequerirSesion({
      duracionMs: 1000,
      async validar(token) {
        return actores[token] ? { usuario: actores[token], renovada: false } : null
      },
    }),
    reasignacion: {
      async opciones(...args) {
        llamadas.push(['opciones', ...args])
        return { anterior: { id: 3, nombre: 'Ana' }, usuarios: [] }
      },
      async reasignar(...args) {
        llamadas.push(['reasignar', ...args])
        return { correosEnviados: true }
      },
    },
  })
  const app = express()
    .use(express.json())
    .use(cookieParser())
    .use('/api/siniestros', router)
    .use(errorHandler)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const pedir = (rol, method = 'GET', body, id = '7') =>
    fetch(`http://127.0.0.1:${server.address().port}/api/siniestros/${id}/reasignacion`, {
      method,
      headers: {
        ...(rol ? { cookie: `cova_sesion=${rol}` } : {}),
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  assert.equal((await pedir(null)).status, 401)
  assert.equal((await pedir('gestor')).status, 403)
  assert.equal((await pedir('gestor', 'PATCH', {})).status, 403)
  assert.equal(llamadas.length, 0)
  assert.equal((await pedir('admin', 'GET', undefined, 'abc')).status, 400)
  const listado = await pedir('admin')
  assert.equal(listado.status, 200)
  assert.equal(listado.headers.get('cache-control'), 'no-store')
  assert.equal(
    (await pedir('admin', 'PATCH', { idUsuarioAnterior: 3, idUsuarioNuevo: 4 })).status,
    400,
  )
  const valido = { idUsuarioAnterior: 3, idUsuarioNuevo: 4, confirmado: true }
  assert.equal((await pedir('super', 'PATCH', { ...valido, idAutor: 88 })).status, 400)
  assert.equal((await pedir('super', 'PATCH', valido)).status, 200)
  assert.deepEqual(llamadas.at(-1), ['reasignar', actores.super, 7, valido])
})

test('correo Resend: destinatario correcto, texto alternativo y HTML escapado', async (t) => {
  const mensajes = []
  t.mock.method(globalThis, 'fetch', async (url, opciones) => {
    assert.equal(url, 'https://api.resend.com/emails')
    mensajes.push(JSON.parse(opciones.body))
    return new Response('{}', { status: 200 })
  })
  const correo = crearCorreoReasignacion({
    apiKey: 'clave-falsa-de-prueba',
    remitente: 'Cova <notificaciones@example.invalid>',
  })
  const datos = {
    email: 'usuario@example.invalid',
    nombre: '<script>persona</script>',
    numeroSiniestro: 'SIN-1',
    anterior: 'Ana & Luis',
    nuevo: 'María',
    autor: 'Administración',
    enlace: 'https://example.invalid/siniestros/1',
  }
  await correo(datos)
  assert.deepEqual(mensajes[0].to, [datos.email])
  assert.ok(mensajes[0].html.includes('&lt;script&gt;persona&lt;/script&gt;'))
  assert.ok(!mensajes[0].html.includes('<script>persona</script>'))
  assert.ok(mensajes[0].html.includes('Ana &amp; Luis'))
  assert.ok(mensajes[0].text.includes('Ahora sos responsable'))
  assert.equal(mensajes.length, 1)
})
