import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'
import { bajaDocumentoSchema, permisoBajaDocumento } from '@cova/shared/schemas/documentos'
import { crearAlmacenamientoR2 } from '../src/lib/r2.ts'

test('permisos: gestor propio hasta 48 h inclusive, administrador sin límite, casos de solo lectura', () => {
  const ahora = new Date('2026-11-04T15:00:00Z')
  const actor = { id: 1, tipoUsuario: 'GESTOR' }
  const caso = { eliminado: false, cerrado: false }
  const doc = {
    idUsuario: 1,
    eliminado: false,
    fechaCarga: new Date(ahora.getTime() - 48 * 3600000),
  }
  assert.equal(permisoBajaDocumento(actor, doc, caso, ahora).permitida, true)
  for (const cambio of [
    { idUsuario: 2 },
    { fechaCarga: new Date(doc.fechaCarga.getTime() - 1) },
    { fechaCarga: new Date(ahora.getTime() + 1) },
    { eliminado: true },
  ])
    assert.equal(permisoBajaDocumento(actor, { ...doc, ...cambio }, caso, ahora).permitida, false)
  for (const tipoUsuario of ['ADMINISTRADOR', 'SUPER_ADMINISTRADOR']) {
    assert.equal(permisoBajaDocumento({ id: 2, tipoUsuario }, doc, caso, ahora).permitida, true)
    assert.equal(
      permisoBajaDocumento({ id: 2, tipoUsuario }, doc, { ...caso, cerrado: true }, ahora)
        .permitida,
      false,
    )
    assert.equal(
      permisoBajaDocumento({ id: 2, tipoUsuario }, doc, { ...caso, eliminado: true }, ahora)
        .permitida,
      false,
    )
  }
  for (const datos of [
    { motivo: '' },
    { motivo: '  ' },
    { motivo: 'x'.repeat(1001) },
    { motivo: 'válido', idUsuario: 2 },
  ])
    assert.equal(bajaDocumentoSchema.safeParse(datos).success, false)
  assert.deepEqual(bajaDocumentoSchema.parse({ motivo: '  Documento equivocado  ' }), {
    motivo: 'Documento equivocado',
  })
})

test('lectura para PDF: SDK conserva bytes, acota 10 MB y cierra el stream', async () => {
  const contenido = Buffer.from('%PDF-1.7 original')
  let cuerpo
  let grande = false
  const s3 = {
    send: async (comando) => {
      assert.equal(comando.constructor.name, 'GetObjectCommand')
      assert.equal(comando.input.Key, 'siniestros/1/prueba.pdf')
      cuerpo = Readable.from(
        grande ? [Buffer.alloc(10 * 1024 * 1024), Buffer.alloc(1)] : [contenido],
      )
      return { Body: cuerpo }
    },
  }
  const r2 = crearAlmacenamientoR2(
    {
      R2_ACCOUNT_ID: 'a'.repeat(32),
      R2_ACCESS_KEY_ID: 'prueba',
      R2_SECRET_ACCESS_KEY: 'prueba',
      R2_BUCKET: 'prueba',
      R2_SIGNED_URL_TTL_SECONDS: 60,
      UPLOAD_MAX_MB: 10,
      UPLOAD_ALLOWED_EXT: ['pdf'],
    },
    s3,
  )
  const stream = await r2.leerParaVista('siniestros/1/prueba.pdf')
  assert.deepEqual(Buffer.concat(await stream.toArray()), contenido)
  assert.equal(cuerpo.destroyed, true)
  grande = true
  const excedido = await r2.leerParaVista('siniestros/1/prueba.pdf')
  await assert.rejects(excedido.toArray(), (e) => e.status === 503)
  assert.equal(cuerpo.destroyed, true)
})
