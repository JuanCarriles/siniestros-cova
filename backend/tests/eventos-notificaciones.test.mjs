import assert from 'node:assert/strict'
import test from 'node:test'
import { crearCorreoActivacion } from '../src/lib/correo-activacion.ts'
import { crearCorreoReasignacion } from '../src/lib/correo-reasignacion.ts'

test('E8-02: activación preparada usa Resend sin contraseñas y escapa los datos', async (t) => {
  const enviados = []
  t.mock.method(globalThis, 'fetch', async (url, opciones) => {
    assert.equal(url, 'https://api.resend.com/emails')
    enviados.push(JSON.parse(opciones.body))
    return new Response('{}', { status: 200 })
  })
  await crearCorreoActivacion({ apiKey: 'falsa', remitente: 'Cova <test@example.invalid>' })({
    email: 'destino@example.invalid',
    nombre: 'Ana <script>alert(1)</script>',
    enlace: 'https://example.invalid/ingresar',
  })
  assert.equal(enviados.length, 1)
  assert.deepEqual(enviados[0].to, ['destino@example.invalid'])
  assert.match(enviados[0].subject, /cuenta está activa/)
  assert.match(enviados[0].html, /&lt;script&gt;/)
  assert.ok(!enviados[0].html.includes('<script>'))
  assert.match(enviados[0].text, /Recuperar contraseña/)
  assert.ok(!enviados[0].text.includes('token'))
})

test('E8-02: el mailer de reasignación no contacta Resend para el responsable anterior', async (t) => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('No debe enviar correo'))
  // Incluso sin API key: no intenta el transporte ni interpreta el contrato anterior como nuevo destinatario.
  await crearCorreoReasignacion({ remitente: 'Cova <test@example.invalid>' })({
    esNuevoResponsable: false,
  })
})
