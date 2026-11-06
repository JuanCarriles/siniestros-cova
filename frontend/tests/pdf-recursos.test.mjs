import assert from 'node:assert/strict'
import test from 'node:test'
import { recursosPdf } from '../plugins/recursos-pdf.ts'

test('PDF.js: conserva codecs locales y excluye el motor de JavaScript en build y desarrollo', () => {
  const plugin = recursosPdf()
  const emitidos = []
  plugin.generateBundle.call({ emitFile: (asset) => emitidos.push(asset) })
  assert.ok(emitidos.some((a) => a.fileName.endsWith('/openjpeg.wasm')))
  assert.ok(emitidos.some((a) => a.fileName.includes('/cmaps/')))
  assert.ok(emitidos.some((a) => a.fileName.includes('/standard_fonts/')))
  assert.ok(!emitidos.some((a) => a.fileName.includes('quickjs-eval')))
  let handler
  plugin.configureServer({
    middlewares: {
      use: (h) => {
        handler = h
      },
    },
  })
  let bytes,
    tipo,
    siguiente = false
  handler(
    { url: '/pdf-recursos/wasm/openjpeg.wasm' },
    {
      setHeader: (_n, v) => {
        tipo = v
      },
      end: (data) => {
        bytes = data
      },
    },
    () => {
      siguiente = true
    },
  )
  assert.ok(bytes.length)
  assert.equal(tipo, 'application/wasm')
  assert.equal(siguiente, false)
  handler(
    { url: '/pdf-recursos/wasm/quickjs-eval.wasm' },
    { end: () => assert.fail('no debe servir quickjs') },
    () => {
      siguiente = true
    },
  )
  assert.equal(siguiente, true)
})
