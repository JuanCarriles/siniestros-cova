import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import { hashPassword } from '../src/lib/password.ts'
import { crearRequerirSesion, requerirRol } from '../src/middlewares/autenticar.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { crearAuthRouter } from '../src/modules/auth/auth.routes.ts'
import { crearServicioAuth, MENSAJE_CREDENCIALES } from '../src/modules/auth/auth.service.ts'
import { crearLimiteIntentos } from '../src/modules/auth/limite-intentos.ts'
import { crearServicioSesiones, hashToken } from '../src/modules/auth/sesiones.service.ts'

const MINUTO = 60_000
const HORA = 60 * MINUTO
const CONTRASENA = 'Gestor.2026'

// Reloj controlable: los tests avanzan el tiempo sin esperar
function reloj(inicio = Date.parse('2026-10-16T12:00:00Z')) {
  let t = inicio
  return { ahora: () => t, fecha: () => new Date(t), avanzar: (ms) => (t += ms) }
}

// Base falsa en memoria con solo lo que usan los servicios de auth
async function baseFalsa() {
  const usuarios = [
    {
      id: 1,
      nombres: 'Gabriela',
      apellidos: 'Gestora',
      email: 'gestor@cova.test',
      tipoUsuario: 'GESTOR',
      contrasena: await hashPassword(CONTRASENA),
      eliminado: false,
      ultimaConexion: null,
    },
    {
      id: 2,
      nombres: 'Bruno',
      apellidos: 'De Baja',
      email: 'baja@cova.test',
      tipoUsuario: 'ADMINISTRADOR',
      contrasena: await hashPassword(CONTRASENA),
      eliminado: true,
      ultimaConexion: null,
    },
  ]
  const sesiones = []
  let id = 0
  const coincide = (s, where) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === 'object' && 'lte' in v ? s[k] <= v.lte : s[k] === v,
    )
  const elegir = (obj, select) => Object.fromEntries(Object.keys(select).map((k) => [k, obj[k]]))
  return {
    usuarios,
    sesiones,
    usuario: {
      async findFirst({ where, select }) {
        const u = usuarios.find(
          (x) => x.email.toLowerCase() === where.email.equals && x.eliminado === where.eliminado,
        )
        return u ? elegir(u, select) : null
      },
      async update({ where, data }) {
        Object.assign(
          usuarios.find((x) => x.id === where.id),
          data,
        )
      },
    },
    sesion: {
      async create({ data }) {
        sesiones.push({ id: ++id, ...data })
      },
      async deleteMany({ where }) {
        for (let i = sesiones.length - 1; i >= 0; i--)
          if (coincide(sesiones[i], where)) sesiones.splice(i, 1)
      },
      async findUnique({ where, select }) {
        const s = sesiones.find((x) => x.tokenHash === where.tokenHash)
        if (!s) return null
        const usuario = usuarios.find((u) => u.id === s.idUsuario)
        return { ...elegir(s, select), usuario: elegir(usuario, select.usuario.select) }
      },
      async update({ where, data }) {
        Object.assign(
          sesiones.find((x) => x.id === where.id),
          data,
        )
      },
    },
  }
}

async function armar() {
  const r = reloj()
  const db = await baseFalsa()
  const sesiones = crearServicioSesiones({ prisma: db, duracionMs: 7 * HORA, ahora: r.fecha })
  const limites = { maximo: 15, ventanaMs: 10 * MINUTO, bloqueoMs: 10 * MINUTO, ahora: r.ahora }
  const auth = crearServicioAuth({
    prisma: db,
    sesiones,
    limitePorEmail: crearLimiteIntentos(limites),
    limitePorIp: crearLimiteIntentos({ ...limites, maximo: 50 }),
  })
  return { r, db, sesiones, auth }
}

test('límite: 15 fallos bloquean 10 minutos; un acierto reinicia el contador', () => {
  const r = reloj()
  const limite = crearLimiteIntentos({
    maximo: 15,
    ventanaMs: 10 * MINUTO,
    bloqueoMs: 10 * MINUTO,
    ahora: r.ahora,
  })
  for (let i = 1; i < 15; i++) assert.equal(limite.registrarFallo('a'), 0, `fallo ${i}`)
  assert.equal(limite.registrarFallo('a'), 10 * MINUTO)
  assert.equal(limite.esperaRestante('otro'), 0, 'cada clave cuenta por separado')
  r.avanzar(9 * MINUTO)
  assert.equal(limite.esperaRestante('a'), MINUTO)
  r.avanzar(MINUTO)
  assert.equal(limite.esperaRestante('a'), 0)

  for (let i = 0; i < 14; i++) limite.registrarFallo('b')
  limite.reiniciar('b')
  assert.equal(limite.registrarFallo('b'), 0)

  // Los fallos viejos (fuera de la ventana de 10 minutos) no suman
  for (let i = 0; i < 14; i++) limite.registrarFallo('c')
  r.avanzar(11 * MINUTO)
  assert.equal(limite.registrarFallo('c'), 0)
})

test('sesión: vence a las 7 h sin actividad y cada uso la renueva', async () => {
  const { r, db, sesiones } = await armar()
  const token = await sesiones.crear(1, { ip: '10.0.0.1', navegador: 'Prueba' })
  assert.equal(db.sesiones.length, 1)
  assert.notEqual(db.sesiones[0].tokenHash, token, 'en la base no queda el token')
  assert.equal(db.sesiones[0].tokenHash, hashToken(token))

  r.avanzar(6 * HORA)
  const valida = await sesiones.validar(token)
  assert.equal(valida?.usuario.email, 'gestor@cova.test')
  assert.equal(valida?.renovada, true)
  assert.equal('eliminado' in valida.usuario, false)

  // Renovada a las 6 h: a las 12 h desde el inicio sigue vigente (6 h sin actividad)
  r.avanzar(6 * HORA)
  assert.ok(await sesiones.validar(token))
  r.avanzar(7 * HORA)
  assert.equal(await sesiones.validar(token), null)
  assert.equal(db.sesiones.length, 0, 'la sesión vencida se borra')
})

test('sesión: token desconocido, cierre de sesión y usuario dado de baja', async () => {
  const { db, sesiones } = await armar()
  assert.equal(await sesiones.validar('inventado'), null)

  const token = await sesiones.crear(1)
  await sesiones.revocar(token)
  assert.equal(await sesiones.validar(token), null)

  const otro = await sesiones.crear(1)
  db.usuarios[0].eliminado = true
  assert.equal(await sesiones.validar(otro), null)
})

test('login: credenciales correctas crean sesión; email sin importar mayúsculas', async () => {
  const { db, auth } = await armar()
  const { usuario, token } = await auth.login(
    { email: 'Gestor@Cova.TEST', contrasena: CONTRASENA },
    { ip: '10.0.0.1' },
  )
  assert.deepEqual(Object.keys(usuario).sort(), [
    'apellidos',
    'email',
    'id',
    'nombres',
    'tipoUsuario',
  ])
  assert.ok(token.length >= 40)
  assert.ok(db.usuarios[0].ultimaConexion instanceof Date)
  assert.equal(db.sesiones.length, 1)
})

test('login: el mismo mensaje para contraseña mal, email inexistente y usuario dado de baja', async () => {
  const { auth } = await armar()
  for (const datos of [
    { email: 'gestor@cova.test', contrasena: 'otra' },
    { email: 'nadie@cova.test', contrasena: CONTRASENA },
    { email: 'baja@cova.test', contrasena: CONTRASENA },
  ]) {
    await assert.rejects(auth.login(datos, { ip: '10.0.0.1' }), {
      status: 401,
      message: MENSAJE_CREDENCIALES,
    })
  }
})

test('login: al 15.º fallo bloquea 10 minutos, incluso con la contraseña correcta', async () => {
  const { r, auth } = await armar()
  const mal = { email: 'gestor@cova.test', contrasena: 'otra' }
  for (let i = 1; i < 15; i++)
    await assert.rejects(auth.login(mal, { ip: '10.0.0.1' }), { status: 401 })
  await assert.rejects(auth.login(mal, { ip: '10.0.0.1' }), {
    status: 429,
    esperaSegundos: 600,
    message: 'Hiciste demasiados intentos. Probá de nuevo en 10 minutos.',
  })
  await assert.rejects(
    auth.login({ email: 'gestor@cova.test', contrasena: CONTRASENA }, { ip: '10.0.0.2' }),
    { status: 429 },
  )
  r.avanzar(10 * MINUTO)
  assert.ok(
    await auth.login({ email: 'gestor@cova.test', contrasena: CONTRASENA }, { ip: '10.0.0.2' }),
  )
})

test('login: 50 fallos desde la misma IP la bloquean para cualquier email', async () => {
  const { auth } = await armar()
  for (let i = 0; i < 49; i++)
    await assert.rejects(
      auth.login({ email: `p${i}@cova.test`, contrasena: 'x' }, { ip: '10.0.0.9' }),
      { status: 401 },
    )
  await assert.rejects(
    auth.login({ email: 'p49@cova.test', contrasena: 'x' }, { ip: '10.0.0.9' }),
    { status: 429 },
  )
  await assert.rejects(
    auth.login({ email: 'gestor@cova.test', contrasena: CONTRASENA }, { ip: '10.0.0.9' }),
    { status: 429 },
  )
})

// Rutas HTTP reales sobre un servidor efímero
async function servidor() {
  const { auth, sesiones } = await armar()
  const requerirSesion = crearRequerirSesion(sesiones)
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/auth', crearAuthRouter({ auth, sesiones, requerirSesion }))
  app.get('/solo-admin', requerirSesion, requerirRol('ADMINISTRADOR'), (_req, res) => res.end())
  app.use(errorHandler)
  const http = app.listen(0)
  await new Promise((ok) => http.once('listening', ok))
  const base = `http://127.0.0.1:${http.address().port}`
  const pedir = (ruta, init = {}) =>
    fetch(base + ruta, {
      ...init,
      headers: { 'content-type': 'application/json', ...init.headers },
    })
  return { pedir, cerrar: () => new Promise((ok) => http.close(ok)) }
}

test('HTTP: login, sesión, rol y cierre de sesión con cookie httpOnly', async (t) => {
  const { pedir, cerrar } = await servidor()
  t.after(cerrar)

  const sinSesion = await pedir('/auth/sesion')
  assert.equal(sinSesion.status, 401)

  const invalido = await pedir('/auth/login', { method: 'POST', body: '{"email":"no-es-email"}' })
  assert.equal(invalido.status, 400)

  const mal = await pedir('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'gestor@cova.test', contrasena: 'otra' }),
  })
  assert.equal(mal.status, 401)
  assert.equal((await mal.json()).error, MENSAJE_CREDENCIALES)

  const ok = await pedir('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'gestor@cova.test', contrasena: CONTRASENA }),
  })
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get('cache-control'), 'no-store')
  const cookie = ok.headers.get('set-cookie')
  assert.match(cookie, /^cova_sesion=[\w-]+;/)
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /SameSite=Lax/i)
  assert.match(cookie, /Max-Age=25200/)
  assert.equal((await ok.json()).usuario.tipoUsuario, 'GESTOR')

  const headers = { cookie: cookie.split(';')[0] }
  const sesion = await pedir('/auth/sesion', { headers })
  assert.equal(sesion.status, 200)
  assert.equal((await sesion.json()).usuario.email, 'gestor@cova.test')

  assert.equal((await pedir('/solo-admin', { headers })).status, 403)

  const salir = await pedir('/auth/logout', { method: 'POST', headers })
  assert.equal(salir.status, 204)
  assert.match(salir.headers.get('set-cookie'), /cova_sesion=;/)
  assert.equal((await pedir('/auth/sesion', { headers })).status, 401)
})

test('HTTP: el bloqueo responde 429 con Retry-After', async (t) => {
  const { pedir, cerrar } = await servidor()
  t.after(cerrar)
  const body = JSON.stringify({ email: 'gestor@cova.test', contrasena: 'otra' })
  let res
  for (let i = 0; i < 15; i++) res = await pedir('/auth/login', { method: 'POST', body })
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('retry-after'), '600')
})
