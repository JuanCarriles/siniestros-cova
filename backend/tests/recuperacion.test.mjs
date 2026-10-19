import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import {
  crearServicioRecuperacion,
  MENSAJE_CODIGO,
  MENSAJE_TOKEN,
  MENSAJE_RECUPERACION,
} from '../src/modules/auth/recuperacion.service.ts'
import { crearRecuperacionRouter } from '../src/modules/auth/recuperacion.routes.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { hashToken, crearServicioSesiones } from '../src/modules/auth/sesiones.service.ts'
import { verifyPassword } from '../src/lib/password.ts'
import {
  solicitarRecuperacionSchema,
  verificarCodigoSchema,
  nuevaContrasenaSchema,
} from '../../shared/src/schemas/auth.ts'

function baseFalsa() {
  const datos = {
    usuarios: [
      { id: 1, email: 'activo@cova.test', eliminado: false, contrasena: 'anterior' },
      { id: 2, email: 'baja@cova.test', eliminado: true },
    ],
    recuperaciones: [],
    sesiones: [{ idUsuario: 1 }, { idUsuario: 1 }, { idUsuario: 2 }],
  }
  let id = 0
  const coincide = (fila, where) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'lte' in v) return fila[k] <= v.lte
      if (v && typeof v === 'object' && 'equals' in v) return fila[k].toLowerCase() === v.equals
      return fila[k] === v
    })
  const borrar = (lista, where) => {
    const anterior = datos[lista].length
    datos[lista] = datos[lista].filter((r) => !coincide(r, where))
    return { count: anterior - datos[lista].length }
  }
  const tx = {
    usuario: {
      findFirst: async ({ where }) => datos.usuarios.find((r) => coincide(r, where)) ?? null,
      updateMany: async ({ where, data }) => {
        const filas = datos.usuarios.filter((r) => coincide(r, where))
        filas.forEach((r) => Object.assign(r, data))
        return { count: filas.length }
      },
    },
    recuperacionContrasena: {
      deleteMany: async ({ where }) => borrar('recuperaciones', where),
      findUnique: async ({ where }) => datos.recuperaciones.find((r) => coincide(r, where)) ?? null,
      upsert: async ({ where, create, update }) => {
        let r = datos.recuperaciones.find((r) => coincide(r, where))
        if (r) Object.assign(r, update)
        else {
          r = { id: ++id, ...create }
          datos.recuperaciones.push(r)
        }
        return r
      },
      update: async ({ where, data }) => {
        const r = datos.recuperaciones.find((r) => coincide(r, where))
        for (const [k, v] of Object.entries(data))
          r[k] = v && typeof v === 'object' && 'increment' in v ? r[k] + v.increment : v
        return r
      },
    },
    sesion: { deleteMany: async ({ where }) => borrar('sesiones', where) },
  }
  let cola = Promise.resolve()
  const base = {
    transaccion(fn) {
      const siguiente = cola.then(async () => {
        const copia = structuredClone(datos)
        try {
          return await fn(tx)
        } catch (err) {
          Object.assign(datos, copia)
          throw err
        }
      })
      cola = siguiente.catch(() => undefined)
      return siguiente
    },
  }
  return { datos, base, tx }
}
function armar() {
  const db = baseFalsa()
  let t = Date.parse('2026-10-19T12:00:00Z')
  const correos = []
  const deps = {
    base: db.base,
    minutos: 5,
    ahora: () => new Date(t),
    enviarCorreo: async (correo) => {
      correos.push(correo)
    },
  }
  return {
    ...db,
    deps,
    servicio: crearServicioRecuperacion(deps),
    correos,
    avanzar: (ms) => {
      t += ms
    },
  }
}
const IP = '127.0.0.1'
const solicitar = (a, email = 'activo@cova.test') => a.servicio.solicitar(email, IP)
async function autorizar(a) {
  const desafio = await solicitar(a)
  return a.servicio.verificar(desafio, a.correos.at(-1).codigo, IP)
}

test('Zod: email, código exacto de 6 dígitos y confirmación de contraseña', () => {
  assert.equal(solicitarRecuperacionSchema.safeParse({ email: 'mal' }).success, false)
  for (const codigo of ['12345', '1234567', 'abcdef'])
    assert.equal(verificarCodigoSchema.safeParse({ codigo }).success, false)
  assert.equal(verificarCodigoSchema.safeParse({ codigo: '000001' }).success, true)
  assert.equal(
    nuevaContrasenaSchema.safeParse({ contrasena: 'corta', confirmarContrasena: 'corta' }).success,
    false,
  )
  assert.equal(
    nuevaContrasenaSchema.safeParse({ contrasena: 'Una frase segura', confirmarContrasena: 'otra' })
      .success,
    false,
  )
})
test('solicitud: código de seis dígitos, vencimiento y sólo hashes en la base', async () => {
  const a = armar()
  const desafio = await solicitar(a, 'ACTIVO@COVA.TEST')
  assert.match(desafio, /^[A-Za-z0-9_-]{43}$/)
  assert.match(a.correos[0].codigo, /^\d{6}$/)
  const r = a.datos.recuperaciones[0]
  assert.equal(r.tokenHash, hashToken(desafio))
  assert.notEqual(r.codigoHash, a.correos[0].codigo)
  assert.equal(r.fechaVencimiento - r.fechaCreacion, 300_000)
  assert.equal(JSON.stringify(r).includes(desafio), false)
})
test('solicitud: cuentas ausentes o dadas de baja no reciben correo y devuelven desafío opaco', async () => {
  const a = armar()
  for (const email of ['nadie@cova.test', 'baja@cova.test'])
    assert.match(await solicitar(a, email), /^[A-Za-z0-9_-]{43}$/)
  assert.equal(a.correos.length, 0)
  assert.equal(a.datos.recuperaciones.length, 0)
})
test('reenvío: espera de 60 segundos y reemplazo del código anterior', async () => {
  const a = armar()
  const anterior = await solicitar(a)
  const codigo = a.correos[0].codigo
  assert.equal(await solicitar(a), null)
  assert.equal(a.correos.length, 1)
  a.avanzar(60_001)
  const nuevo = await solicitar(a)
  assert.notEqual(nuevo, anterior)
  assert.equal(a.datos.recuperaciones.length, 1)
  await assert.rejects(a.servicio.verificar(anterior, codigo, IP), { message: MENSAJE_CODIGO })
})
test('código: vence exactamente a los cinco minutos', async () => {
  const a = armar()
  const desafio = await solicitar(a)
  a.avanzar(300_000)
  await assert.rejects(a.servicio.verificar(desafio, a.correos[0].codigo, IP), {
    message: MENSAJE_CODIGO,
  })
})
test('código: cinco fallos bloquean incluso tras reiniciar el servicio', async () => {
  const a = armar()
  const desafio = await solicitar(a)
  const mal = a.correos[0].codigo === '000000' ? '111111' : '000000'
  for (let n = 0; n < 5; n++)
    await assert.rejects(a.servicio.verificar(desafio, mal, IP), { message: MENSAJE_CODIGO })
  const reiniciado = crearServicioRecuperacion(a.deps)
  await assert.rejects(reiniciado.verificar(desafio, a.correos[0].codigo, IP), {
    message: MENSAJE_CODIGO,
  })
})
test('autorización: no permite saltar el código, lo consume y rota el token', async () => {
  const a = armar()
  const desafio = await solicitar(a)
  await assert.rejects(a.servicio.cambiar(desafio, 'Contraseña nueva', IP), {
    message: MENSAJE_TOKEN,
  })
  const token = await a.servicio.verificar(desafio, a.correos[0].codigo, IP)
  assert.notEqual(token, desafio)
  assert.equal(a.datos.recuperaciones[0].codigoHash, null)
  await assert.rejects(a.servicio.verificar(desafio, a.correos[0].codigo, IP), {
    message: MENSAJE_CODIGO,
  })
})
test('cambio: hash Argon2, cierra todas las sesiones del usuario y consume el token', async () => {
  const a = armar()
  const token = await autorizar(a)
  await a.servicio.cambiar(token, 'Nueva contraseña segura', IP)
  assert.ok(await verifyPassword(a.datos.usuarios[0].contrasena, 'Nueva contraseña segura'))
  assert.equal(a.datos.recuperaciones.length, 0)
  assert.deepEqual(a.datos.sesiones, [{ idUsuario: 2 }])
  await assert.rejects(a.servicio.cambiar(token, 'Una segunda contraseña', IP), {
    message: MENSAJE_TOKEN,
  })
})
test('token: la verificación no extiende su vencimiento y una baja impide cambiar', async () => {
  const a = armar()
  const token = await autorizar(a)
  a.avanzar(300_000)
  await assert.rejects(a.servicio.cambiar(token, 'Una contraseña nueva', IP), {
    message: MENSAJE_TOKEN,
  })
  const b = armar()
  const otro = await autorizar(b)
  b.datos.usuarios[0].eliminado = true
  await assert.rejects(b.servicio.cambiar(otro, 'Una contraseña nueva', IP), {
    message: MENSAJE_TOKEN,
  })
  assert.equal(b.datos.usuarios[0].contrasena, 'anterior')
})
test('concurrencia: un único cambio gana con el mismo token', async () => {
  const a = armar()
  const token = await autorizar(a)
  const resultados = await Promise.allSettled([
    a.servicio.cambiar(token, 'Primera contraseña', IP),
    a.servicio.cambiar(token, 'Segunda contraseña', IP),
  ])
  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1)
})
test('transacción: si falla revocar sesiones, tampoco se cambia la contraseña ni se consume el token', async () => {
  const a = armar()
  const token = await autorizar(a)
  a.tx.sesion.deleteMany = async () => {
    throw new Error('Base no disponible')
  }
  await assert.rejects(a.servicio.cambiar(token, 'Una contraseña nueva', IP))
  assert.equal(a.datos.usuarios[0].contrasena, 'anterior')
  assert.equal(a.datos.recuperaciones.length, 1)
})
test('HTTP: respuesta genérica, cookie httpOnly y token ausente del JSON', async (t) => {
  const a = armar()
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/auth/recuperacion', crearRecuperacionRouter(a.servicio))
  app.use(errorHandler)
  const http = app.listen(0)
  await new Promise((ok) => http.once('listening', ok))
  t.after(() => http.close())
  const url = `http://127.0.0.1:${http.address().port}/api/auth/recuperacion`
  const post = (path, body, cookie) =>
    fetch(url + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    })
  const cuerpos = []
  let cookie
  for (const email of ['activo@cova.test', 'nadie@cova.test', 'baja@cova.test']) {
    const res = await post('/solicitar', { email })
    assert.equal(res.status, 202)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.match(res.headers.get('set-cookie'), /HttpOnly/)
    assert.match(res.headers.get('set-cookie'), /SameSite=Lax/)
    assert.match(res.headers.get('set-cookie'), /Path=\/api\/auth\/recuperacion/)
    if (!cookie) cookie = res.headers.get('set-cookie').split(';')[0]
    cuerpos.push(await res.json())
  }
  assert.deepEqual(cuerpos[0], cuerpos[1])
  assert.deepEqual(cuerpos[1], cuerpos[2])
  assert.equal(cuerpos[0].mensaje, MENSAJE_RECUPERACION)
  assert.equal(
    (
      await post(
        '/cambiar',
        { contrasena: 'Una contraseña nueva', confirmarContrasena: 'Una contraseña nueva' },
        cookie,
      )
    ).status,
    400,
  )
  const verificada = await post('/verificar', { codigo: a.correos[0].codigo }, cookie)
  assert.equal(verificada.status, 204)
  const token = verificada.headers.get('set-cookie').split(';')[0]
  const cambio = await post(
    '/cambiar',
    { contrasena: 'Una contraseña nueva', confirmarContrasena: 'Una contraseña nueva' },
    token,
  )
  assert.equal(cambio.status, 204)
  assert.match(cambio.headers.get('set-cookie'), /cova_sesion=/)
})

test(
  'PostgreSQL real: consumo concurrente y revocación de sesiones',
  { skip: process.env.RECUPERACION_TEST_DB !== '1' },
  async () => {
    const { getPrisma, disconnectPrisma } = await import('../src/lib/prisma.ts')
    const { baseRecuperacion } = await import('../src/modules/auth/recuperacion.prisma.ts')
    const db = getPrisma()
    let usuario
    const correos = []
    try {
      usuario = await db.usuario.create({
        data: {
          nombres: 'Prueba',
          apellidos: 'Recuperación temporal',
          documento: 'prueba-recuperacion',
          telefono: '0',
          email: `recuperacion-${crypto.randomUUID()}@cova.invalid`,
          contrasena: 'hash-anterior-de-prueba',
          tipoUsuario: 'GESTOR',
          direccion: { create: { localidad: 'Prueba temporal' } },
        },
      })
      const sesiones = crearServicioSesiones({ prisma: db, duracionMs: 3_600_000 })
      const vieja1 = await sesiones.crear(usuario.id)
      const vieja2 = await sesiones.crear(usuario.id)
      const servicio = crearServicioRecuperacion({
        base: baseRecuperacion,
        minutos: 5,
        enviarCorreo: async (d) => {
          correos.push(d)
        },
      })
      const desafio = await servicio.solicitar(usuario.email, IP)
      const verificaciones = await Promise.allSettled([
        servicio.verificar(desafio, correos[0].codigo, IP),
        servicio.verificar(desafio, correos[0].codigo, IP),
      ])
      const exitosas = verificaciones.filter((r) => r.status === 'fulfilled')
      assert.equal(exitosas.length, 1)
      const token = exitosas[0].value
      const cambios = await Promise.allSettled([
        servicio.cambiar(token, 'Contraseña segura de prueba', IP),
        servicio.cambiar(token, 'Otra contraseña de prueba', IP),
      ])
      assert.equal(cambios.filter((r) => r.status === 'fulfilled').length, 1)
      assert.equal(await sesiones.validar(vieja1), null)
      assert.equal(await sesiones.validar(vieja2), null)
      assert.equal(await db.recuperacionContrasena.count({ where: { idUsuario: usuario.id } }), 0)
    } finally {
      if (usuario) {
        await db.recuperacionContrasena.deleteMany({ where: { idUsuario: usuario.id } })
        await db.sesion.deleteMany({ where: { idUsuario: usuario.id } })
        await db.usuario.delete({ where: { id: usuario.id } })
        await db.direccion.delete({ where: { id: usuario.idDireccion } })
      }
      await disconnectPrisma()
    }
  },
)

test('reinicio: el cooldown persistido conserva la cookie sin revelar si la cuenta existe', async () => {
  const a = armar()
  const desafio = await solicitar(a)
  const reiniciado = crearServicioRecuperacion(a.deps)
  assert.equal(await reiniciado.solicitar('activo@cova.test', IP, desafio), desafio)
  assert.match(
    await crearServicioRecuperacion(a.deps).solicitar('activo@cova.test', IP),
    /^[A-Za-z0-9_-]{43}$/,
  )
})

test('Resend: envío por API con destinatario original y sin exponer secretos en errores', async (t) => {
  const { crearCorreoRecuperacion } = await import('../src/lib/correo-recuperacion.ts')
  const original = globalThis.fetch
  t.after(() => {
    globalThis.fetch = original
  })
  let pedido
  globalThis.fetch = async (url, options) => {
    pedido = { url, ...options }
    return new Response('{}', { status: 200 })
  }
  const enviar = crearCorreoRecuperacion({
    apiKey: 'clave-de-prueba',
    remitente: 'Estudio Cova <onboarding@resend.dev>',
  })
  await enviar({ email: 'activo@cova.test', codigo: '000123', minutos: 5 })
  assert.equal(pedido.url, 'https://api.resend.com/emails')
  const payload = JSON.parse(pedido.body)
  assert.deepEqual(payload.to, ['activo@cova.test'])
  assert.ok(payload.text.includes('000123'))
  assert.ok(payload.text.includes('5 minutos'))
  globalThis.fetch = async () =>
    new Response('credenciales y datos privados del proveedor', { status: 403 })
  await assert.rejects(enviar({ email: 'activo@cova.test', codigo: '000123', minutos: 5 }), {
    message: 'Resend rechazó el envío (403)',
  })
})
