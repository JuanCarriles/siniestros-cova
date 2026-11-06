import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'
import { S3Client } from '@aws-sdk/client-s3'
import { crearAlmacenamientoR2 } from '../src/lib/r2.ts'
import { leerConfiguracionR2 } from '../src/config/r2.ts'
import { ARCHIVO_MAX_BYTES } from '@cova/shared/schemas/archivos'

function fixture(t, responder) {
  const config = leerConfiguracionR2({
    R2_ACCOUNT_ID: 'a'.repeat(32),
    R2_ACCESS_KEY_ID: 'prueba',
    R2_SECRET_ACCESS_KEY: 'prueba',
    R2_BUCKET: 'prueba',
  })
  const cliente = new S3Client({
    region: 'auto',
    credentials: { accessKeyId: 'prueba', secretAccessKey: 'prueba' },
  })
  const comandos = []
  cliente.send = async (command, options) => {
    comandos.push(command)
    return responder(command, options)
  }
  const r2 = crearAlmacenamientoR2(config, cliente)
  t.after(() => r2.cerrar())
  return { r2, comandos }
}
const clave = 'siniestros/1/prueba.pdf'

test('PDF: un solo GET, stream perezoso y bytes exactos; no hace HEAD ni acumula todo antes de entregar', async (t) => {
  let leidos = 0,
    signal
  const cuerpo = Readable.from(
    (async function* () {
      leidos++
      yield Buffer.from('%PDF-1.7')
      leidos++
      yield Buffer.from(' contenido')
    })(),
  )
  const { r2, comandos } = fixture(t, (_c, opciones) => {
    signal = opciones.abortSignal
    return { Body: cuerpo }
  })
  const stream = await r2.leerParaVista(clave)
  assert.ok(stream instanceof Readable)
  assert.equal(leidos, 0)
  const partes = []
  for await (const parte of stream) partes.push(parte)
  assert.equal(Buffer.concat(partes).toString(), '%PDF-1.7 contenido')
  assert.deepEqual(
    comandos.map((c) => c.constructor.name),
    ['GetObjectCommand'],
  )
  assert.equal(comandos[0].input.Key, clave)
  assert.equal(cuerpo.destroyed, true)
  assert.equal(signal.aborted, true)
})
test('PDF: objeto inexistente es 404; acceso y fallos de R2 son 503 sin exponer secretos', async (t) => {
  for (const [error, status] of [
    [{ name: 'NoSuchKey' }, 404],
    [{ name: 'NotFound' }, 404],
    [{ $metadata: { httpStatusCode: 404 } }, 404],
    [{ name: 'AccessDenied', message: 'secreto-interno' }, 503],
    [new Error('secreto-interno'), 503],
  ]) {
    const { r2 } = fixture(t, () => {
      throw error
    })
    await assert.rejects(
      r2.leerParaVista(clave),
      (e) => e.status === status && !e.message.includes('secreto-interno'),
    )
  }
})
test('PDF: rechaza el tamaño declarado excesivo y cierra el cuerpo sin consumirlo', async (t) => {
  let leidos = 0
  const cuerpo = Readable.from(
    (async function* () {
      leidos++
      yield Buffer.from('no leer')
    })(),
  )
  const { r2 } = fixture(t, () => ({ Body: cuerpo, ContentLength: ARCHIVO_MAX_BYTES + 1 }))
  await assert.rejects(r2.leerParaVista(clave), (e) => e.status === 503)
  assert.equal(leidos, 0)
  assert.equal(cuerpo.destroyed, true)
})
test('PDF: limita los bytes reales aunque R2 declare menos o no declare longitud', async (t) => {
  for (const ContentLength of [undefined, 1]) {
    const cuerpo = Readable.from([Buffer.alloc(ARCHIVO_MAX_BYTES), Buffer.from('x')])
    const { r2 } = fixture(t, () => ({ Body: cuerpo, ContentLength }))
    const stream = await r2.leerParaVista(clave)
    let recibidos = 0
    await assert.rejects(
      async () => {
        for await (const parte of stream) recibidos += parte.length
      },
      (e) => e.status === 503,
    )
    assert.ok(recibidos <= ARCHIVO_MAX_BYTES)
    assert.equal(cuerpo.destroyed, true)
  }
})
test('PDF: cerrar el consumidor libera el cuerpo y cancela la petición de R2', async (t) => {
  const cuerpo = new Readable({
    read() {
      this.push(Buffer.alloc(1024))
    },
  })
  let signal
  const { r2 } = fixture(t, (_c, opciones) => {
    signal = opciones.abortSignal
    return { Body: cuerpo }
  })
  const stream = await r2.leerParaVista(clave)
  for await (const _parte of stream) break
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(cuerpo.destroyed, true)
  assert.equal(signal.aborted, true)
})
test('PDF: un fallo a mitad del cuerpo se propaga como lectura fallida, sin devolver contenido parcial como completo', async (t) => {
  const cuerpo = Readable.from(
    (async function* () {
      yield Buffer.from('%PDF')
      throw new Error('fallo-interno')
    })(),
  )
  const { r2 } = fixture(t, () => ({ Body: cuerpo }))
  const stream = await r2.leerParaVista(clave)
  await assert.rejects(
    async () => {
      for await (const _parte of stream) {
        /* Consumir hasta el fallo del cuerpo. */
      }
    },
    (e) => e.status === 503 && !e.message.includes('fallo-interno'),
  )
  assert.equal(cuerpo.destroyed, true)
})
