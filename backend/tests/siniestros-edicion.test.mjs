import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import { crearRequerirSesion } from '../src/middlewares/autenticar.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { crearSiniestrosRouter } from '../src/modules/siniestros/siniestros.routes.ts'
import {
  editarCasoAdministradorSchema,
  editarCasoGestorSchema,
} from '@cova/shared/schemas/edicion-caso'

test('contratos: el gestor no puede incluir póliza, asignación ni autor/fechas de auditoría', () => {
  const gestor = {
    version: 'a'.repeat(64),
    hecho: { fechaOcurrencia: null, horaOcurrencia: null, menorEdadInvolucrado: false, causa: '' },
    lugar: { idProvincia: null, calle: '', localidad: '', codigoPostal: '' },
  }
  assert.equal(editarCasoGestorSchema.parse(gestor).hecho.causa, null)
  for (const extra of [
    { poliza: {} },
    { asignacion: {} },
    { idUsuario: 1 },
    { fechaEvento: '2026-01-01' },
  ])
    assert.equal(editarCasoGestorSchema.safeParse({ ...gestor, ...extra }).success, false)
  assert.equal(
    editarCasoGestorSchema.safeParse({
      ...gestor,
      hecho: { ...gestor.hecho, horaOcurrencia: '18:40' },
    }).success,
    false,
  )
  const admin = {
    ...gestor,
    poliza: {
      numeroSiniestro: ' S-1 ',
      numeroPoliza: ' P-1 ',
      sucursal: 'Central',
      idAseguradora: 1,
      inicioVigencia: '',
    },
    asignacion: { idUsuario: 3, idAjustador: '' },
  }
  assert.equal(editarCasoAdministradorSchema.parse(admin).poliza.numeroSiniestro, 'S-1')
})

test('HTTP: sesión e id válidos; el servicio recibe al actor de la cookie y el cuerpo para validar por rol', async (t) => {
  const actor = {
    id: 1,
    nombres: 'Gestor',
    apellidos: 'Prueba',
    email: 'test@example.invalid',
    tipoUsuario: 'GESTOR',
  }
  const llamadas = []
  const app = express()
  app.use(express.json(), cookieParser())
  app.use(
    '/api/siniestros',
    crearSiniestrosRouter({
      requerirSesion: crearRequerirSesion({
        duracionMs: 1000,
        validar: async (token) => (token === 'valida' ? { usuario: actor, renovada: false } : null),
      }),
      edicion: {
        obtener: async (...args) => {
          llamadas.push(args)
          return {}
        },
        modificar: async (...args) => {
          llamadas.push(args)
          return { modificado: true, correosEnviados: true }
        },
      },
    }),
  )
  app.use(errorHandler)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((ok) => server.once('listening', ok))
  t.after(() => new Promise((ok) => server.close(ok)))
  const pedir = (ruta, token, method = 'GET', body) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/siniestros${ruta}`, {
      method,
      headers: {
        ...(token ? { cookie: `cova_sesion=${token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  assert.equal((await pedir('/7/edicion')).status, 401)
  const res = await pedir('/7/edicion', 'valida')
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.deepEqual(llamadas.pop(), [actor, 7])
  assert.equal((await pedir('/abc/datos', 'valida', 'PATCH', {})).status, 400)
  assert.equal((await pedir('/7/datos', 'valida', 'PATCH', { hecho: {} })).status, 200)
  assert.deepEqual(llamadas.pop(), [actor, 7, { hecho: {} }])
})

test('correo de reasignación: usa Resend y escapa los textos del caso', async () => {
  const { crearCorreoReasignacion } = await import('../src/lib/correo-reasignacion.ts')
  const originalFetch = globalThis.fetch
  let enviado
  globalThis.fetch = async (url, opciones) => {
    assert.equal(url, 'https://api.resend.com/emails')
    enviado = JSON.parse(opciones.body)
    return new Response('{}', { status: 200 })
  }
  try {
    await crearCorreoReasignacion({
      apiKey: 'clave-ficticia',
      remitente: 'prueba@example.invalid',
    })({
      email: 'destino@example.invalid',
      nombre: '<script>Nombre</script>',
      numeroSiniestro: 'S-1',
      anterior: 'Anterior',
      nuevo: 'Nuevo',
      autor: 'Admin',
      enlace: 'https://cova.example.invalid/siniestros',
    })
    assert.deepEqual(enviado.to, ['destino@example.invalid'])
    assert.ok(enviado.html.includes('&lt;script&gt;Nombre&lt;/script&gt;'))
    assert.ok(!enviado.html.includes('<script>'))
    assert.ok(enviado.text.includes('Responsable anterior: Anterior. Nuevo responsable: Nuevo.'))
  } finally {
    globalThis.fetch = originalFetch
  }
})
