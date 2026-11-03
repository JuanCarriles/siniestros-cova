import assert from 'node:assert/strict'
import test from 'node:test'
import { gzipSync, gunzipSync } from 'node:zlib'
import { ColaDocumentos } from '../src/features/siniestros/ficha/documentos/cola-documentos.ts'
import { comprimirDocumento } from '../src/features/siniestros/ficha/documentos/transporte.ts'
import { ApiError } from '../src/lib/api.ts'
import { DOCUMENTO_MAX_BYTES } from '../../shared/src/schemas/documentos.ts'

test('compresión sin pérdida: reduce el envío, conserva nombre/contenido y rechaza originales mayores a 10 MB', async () => {
  const original = new File(
    ['%PDF-1.7\n' + 'Texto del expediente. '.repeat(5000)],
    'Documento á.pdf',
  )
  const resultado = await comprimirDocumento(original, new AbortController().signal)
  assert.equal(resultado.compresion, 'gzip')
  assert.ok(resultado.contenido.size < original.size)
  assert.deepEqual(
    gunzipSync(Buffer.from(await resultado.contenido.arrayBuffer())),
    Buffer.from(await original.arrayBuffer()),
  )
  const incomprimible = new File(
    [gzipSync(Buffer.from(crypto.getRandomValues(new Uint8Array(1000))))],
    'ya-comprimido.pdf',
  )
  assert.equal(
    (await comprimirDocumento(incomprimible, new AbortController().signal)).compresion,
    'identity',
  )
  await assert.rejects(
    comprimirDocumento(
      new File([new Uint8Array(DOCUMENTO_MAX_BYTES + 1)], 'grande.pdf'),
      new AbortController().signal,
    ),
    /10 MB/,
  )
})

test('cola: envía de a uno, continúa si uno falla y reintenta solo ese con el mismo identificador', async () => {
  let enCurso = 0,
    maximo = 0,
    avisos = 0
  const intentos = []
  let fallar = true
  const cola = new ColaDocumentos({
    preparar: async (archivo) => ({ contenido: archivo, compresion: 'identity' }),
    enviar: async (fila, _preparado, progreso, guardando) => {
      enCurso++
      maximo = Math.max(maximo, enCurso)
      intentos.push([fila.archivo.name, fila.id])
      progreso(50)
      await new Promise((ok) => setTimeout(ok, 5))
      guardando()
      enCurso--
      if (fila.archivo.name === 'dos.pdf' && fallar)
        throw new ApiError(503, 'R2 temporalmente caído')
      return intentos.length
    },
    guardado: () => {
      avisos++
    },
  })
  const esperar = () =>
    new Promise((resolve, reject) => {
      const limite = setTimeout(() => {
        salir()
        reject(new Error('La cola no terminó'))
      }, 3000)
      const comprobar = () => {
        if (cola.instantanea().every((f) => ['completo', 'error'].includes(f.estado))) {
          clearTimeout(limite)
          salir()
          resolve()
        }
      }
      const salir = cola.suscribir(comprobar)
      comprobar()
    })
  cola.agregar(['uno.pdf', 'dos.pdf', 'tres.pdf'].map((nombre) => new File(['%PDF-1.7'], nombre)))
  await esperar()
  assert.equal(maximo, 1)
  assert.deepEqual(
    cola.instantanea().map((f) => f.estado),
    ['completo', 'error', 'completo'],
  )
  assert.equal(avisos, 2)
  const fallido = cola.instantanea()[1]
  fallar = false
  cola.reintentar(fallido.id)
  await esperar()
  assert.deepEqual(
    intentos.map((i) => i[0]),
    ['uno.pdf', 'dos.pdf', 'tres.pdf', 'dos.pdf'],
  )
  assert.equal(intentos[1][1], intentos[3][1])
  assert.ok(cola.instantanea().every((f) => f.estado === 'completo' && f.progreso === 100))
  assert.equal(avisos, 3)
  cola.cerrar()
})
