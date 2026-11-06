import assert from 'node:assert/strict'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import { decodificarDocumento } from '../src/modules/documentos/transporte-documento.ts'
import { DOCUMENTO_MAX_BYTES } from '@cova/shared/schemas/documentos'

test('transporte: descomprime sin alterar bytes y limita también un gzip pequeño que se expande a más de 10 MB', async () => {
  const original = Buffer.from('%PDF-1.7\nDocumento original')
  const archivo = { nombreOriginal: 'Documento.pdf', contenido: gzipSync(original) }
  const decodificado = await decodificarDocumento(archivo, 'gzip')
  assert.equal(decodificado.nombreOriginal, archivo.nombreOriginal)
  assert.deepEqual(decodificado.contenido, original)
  await assert.rejects(
    decodificarDocumento(
      { ...archivo, contenido: gzipSync(Buffer.alloc(DOCUMENTO_MAX_BYTES + 1)) },
      'gzip',
    ),
    { status: 413 },
  )
  await assert.rejects(
    decodificarDocumento({ ...archivo, contenido: Buffer.from('gzip inválido') }, 'gzip'),
    { status: 400 },
  )
  await assert.rejects(decodificarDocumento(archivo, 'br'), { name: 'ZodError' })
})
