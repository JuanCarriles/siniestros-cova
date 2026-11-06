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

test('sin compresor o si falla: envía el original intacto; no omite validación ni cancelación', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'CompressionStream')
  const original = new File(['%PDF-1.7 original'], 'Nombre original.pdf')
  try {
    for (const value of [
      undefined,
      class {
        constructor() {
          throw new Error('Compresor no disponible')
        }
      },
    ]) {
      Object.defineProperty(globalThis, 'CompressionStream', { configurable: true, value })
      const resultado = await comprimirDocumento(original, new AbortController().signal)
      assert.equal(resultado.compresion, 'identity')
      assert.equal(resultado.contenido, original)
      assert.equal(resultado.contenido.name, 'Nombre original.pdf')
      const cancelado = new AbortController()
      cancelado.abort()
      await assert.rejects(comprimirDocumento(original, cancelado.signal), { name: 'AbortError' })
      await assert.rejects(
        comprimirDocumento(
          new File([new Uint8Array(DOCUMENTO_MAX_BYTES + 1)], 'grande.pdf'),
          new AbortController().signal,
        ),
        /10 MB/,
      )
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'CompressionStream', descriptor)
    else delete globalThis.CompressionStream
  }
})

function esperarCola(cola, condicion) {
  return new Promise((resolve, reject) => {
    const limite = setTimeout(() => {
      salir()
      reject(new Error('La cola no llegó al estado esperado'))
    }, 3000)
    const comprobar = () => {
      if (condicion(cola.instantanea())) {
        clearTimeout(limite)
        salir()
        resolve()
      }
    }
    const salir = cola.suscribir(comprobar)
    comprobar()
  })
}

for (const etapa of ['comprimiendo', 'subiendo', 'guardando']) {
  test(`cola: cerrar y reactivar durante ${etapa} retoma el UUID sin envíos superpuestos ni callbacks antiguos`, async (t) => {
    let liberar
    const pausa = new Promise((resolve) => {
      liberar = resolve
    })
    let preparaciones = 0,
      enCurso = 0,
      maximo = 0,
      guardados = 0
    const envios = []
    let progresoAntiguo, guardandoAntiguo
    const cola = new ColaDocumentos({
      preparar: async (archivo) => {
        preparaciones++
        if (etapa === 'comprimiendo' && preparaciones === 1) await pausa
        return { contenido: archivo, compresion: 'identity' }
      },
      enviar: async (fila, _preparado, progreso, guardando) => {
        envios.push([fila.archivo.name, fila.id])
        enCurso++
        maximo = Math.max(maximo, enCurso)
        try {
          if (etapa !== 'comprimiendo' && envios.length === 1) {
            progresoAntiguo = progreso
            guardandoAntiguo = guardando
            progreso(50)
            if (etapa === 'guardando') guardando()
            await pausa
          }
          return envios.length
        } finally {
          enCurso--
        }
      },
      guardado: () => {
        guardados++
      },
    })
    t.after(() => {
      liberar()
      cola.cerrar()
    })
    cola.agregar(['uno.pdf', 'dos.pdf'].map((n) => new File(['%PDF-1.7'], n)))
    await esperarCola(cola, (filas) => filas[0]?.estado === etapa)
    const id = cola.instantanea()[0].id
    // Reactivar una cola que ya estaba activa no reinicia el envío actual.
    cola.activar()
    assert.equal(cola.instantanea()[0].estado, etapa)
    cola.cerrar()
    cola.activar()
    assert.equal(cola.instantanea()[0].id, id)
    assert.equal(cola.instantanea()[0].estado, 'pendiente')
    progresoAntiguo?.(98)
    guardandoAntiguo?.()
    assert.equal(cola.instantanea()[0].estado, 'pendiente')
    assert.equal(cola.instantanea()[0].progreso, 0)
    liberar()
    await esperarCola(cola, (filas) => filas.every((f) => f.estado === 'completo'))
    assert.equal(maximo, 1)
    assert.equal(guardados, 2)
    assert.ok(envios.filter(([n]) => n === 'uno.pdf').every(([, uuid]) => uuid === id))
    assert.equal(envios.filter(([n]) => n === 'dos.pdf').length, 1)
    assert.equal(envios.filter(([n]) => n === 'uno.pdf').length, etapa === 'comprimiendo' ? 1 : 2)
    assert.ok(cola.instantanea().every((f) => f.progreso === 100))
  })
}

test('cola: si termina de cancelarse antes de reactivar también retoma la fila interrumpida', async () => {
  let rechazar,
    intentos = 0,
    guardados = 0
  const cola = new ColaDocumentos({
    preparar: async (archivo) => ({ contenido: archivo, compresion: 'identity' }),
    enviar: async () => {
      intentos++
      if (intentos === 1)
        await new Promise((_resolve, reject) => {
          rechazar = reject
        })
      return 1
    },
    guardado: () => {
      guardados++
    },
  })
  cola.agregar([new File(['%PDF-1.7'], 'interrumpido.pdf')])
  await esperarCola(cola, (filas) => filas[0]?.estado === 'subiendo')
  const id = cola.instantanea()[0].id
  cola.cerrar()
  rechazar(new DOMException('Cancelado', 'AbortError'))
  await new Promise((resolve) => setImmediate(resolve))
  cola.activar()
  await esperarCola(cola, (filas) => filas[0]?.estado === 'completo')
  assert.equal(cola.instantanea()[0].id, id)
  assert.equal(intentos, 2)
  assert.equal(guardados, 1)
  cola.cerrar()
})
