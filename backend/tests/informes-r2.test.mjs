import test from 'node:test'
import assert from 'node:assert/strict'
import { S3Client } from '@aws-sdk/client-s3'
import { leerConfiguracionR2 } from '../src/config/r2.ts'
import { crearAlmacenamientoR2 } from '../src/lib/r2.ts'
import { enviarCorreoResend } from '../src/lib/correo-resend.ts'
const variables = {
  R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_ACCESS_KEY_ID: 'prueba',
  R2_SECRET_ACCESS_KEY: 'solo-prueba',
  R2_BUCKET: 'bucket-prueba',
}
test('Informe: solo PDF en su carpeta privada y firma real de 60 segundos con MIME y attachment', async () => {
  const config = leerConfiguracionR2(variables),
    cliente = new S3Client({
      region: 'auto',
      endpoint: `https://${variables.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: 'prueba', secretAccessKey: 'prueba' },
    })
  const comandos = []
  cliente.send = async (c) => {
    comandos.push(c)
    return {}
  }
  const r2 = crearAlmacenamientoR2(config, cliente),
    key = 'informes mensuales/2026/10/11111111-1111-4111-8111-111111111111.pdf'
  try {
    await r2.subirInforme(key, Buffer.from('%PDF-1.4\nPrueba'))
    assert.equal(comandos.length, 1)
    assert.equal(comandos[0].input.Key, `dev/${key}`)
    assert.equal(comandos[0].input.ContentType, 'application/pdf')
    assert.equal(comandos[0].input.ACL, undefined)
    const firma = await r2.firmarDescarga(key, 'informe-2026-10.pdf', 'application/pdf'),
      url = new URL(firma.url)
    assert.equal(url.searchParams.get('X-Amz-Expires'), '60')
    assert.equal(url.searchParams.get('response-content-type'), 'application/pdf')
    assert.match(url.searchParams.get('response-content-disposition'), /^attachment;/)
    await assert.rejects(r2.subirInforme(key, Buffer.from('MZ')))
    await assert.rejects(r2.subirInforme('informes mensuales/../otro.pdf', Buffer.from('%PDF-1.4')))
    assert.equal(comandos.length, 1)
  } finally {
    r2.cerrar()
  }
})
test('Resend: adjunto PDF y clave estable de idempotencia, sin cambiar los mails existentes', async (t) => {
  const mensajes = []
  t.mock.method(globalThis, 'fetch', async (_url, opciones) => {
    mensajes.push(opciones)
    return new Response('{}', { status: 200 })
  })
  await enviarCorreoResend(
    { apiKey: 'clave-ficticia', remitente: 'Cova <mail@example.invalid>' },
    {
      email: 'super@example.invalid',
      asunto: 'Informe',
      html: '<p>Informe</p>',
      texto: 'Informe',
      claveEnvio: 'informe-prueba',
      adjuntos: [{ filename: 'informe.pdf', content: Buffer.from('%PDF-1.4').toString('base64') }],
    },
  )
  assert.equal(mensajes[0].headers['Idempotency-Key'], 'informe-prueba')
  assert.equal(JSON.parse(mensajes[0].body).attachments[0].filename, 'informe.pdf')
  await enviarCorreoResend(
    { apiKey: 'clave-ficticia', remitente: 'Cova <mail@example.invalid>' },
    { email: 'otro@example.invalid', asunto: 'Seguridad', html: '<p>Cambio</p>', texto: 'Cambio' },
  )
  assert.equal(JSON.parse(mensajes[1].body).attachments, undefined)
})
