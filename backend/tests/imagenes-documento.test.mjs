import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { S3Client } from '@aws-sdk/client-s3'
import {
  prepararImagen,
  subirDocumentoProcesado,
  claveDerivada,
  CALIDAD_IMAGEN,
} from '../src/modules/documentos/imagenes-documento.ts'
import { crearAlmacenamientoR2 } from '../src/lib/r2.ts'
import { leerConfiguracionR2 } from '../src/config/r2.ts'

test('sharp: lado largo de 1600 y miniatura de 300, proporción, WebP y calidad 80', async () => {
  const svg = Buffer.from(
    '<svg width="3200" height="2000" xmlns="http://www.w3.org/2000/svg"><rect width="3200" height="2000" fill="white"/><text x="100" y="250" font-size="100">ACTA DE SINIESTRO 2026-12345</text></svg>',
  )
  const original = await sharp(svg).jpeg({ quality: 95 }).toBuffer()
  const copia = Buffer.from(original)
  const imagen = await prepararImagen({ nombreOriginal: 'Acta.jpg', contenido: original })
  assert.equal(CALIDAD_IMAGEN, 80)
  assert.deepEqual([imagen.datos.ancho, imagen.datos.alto], [1600, 1000])
  assert.deepEqual([imagen.datos.anchoOriginal, imagen.datos.altoOriginal], [3200, 2000])
  const mini = await sharp(imagen.miniatura).metadata()
  assert.deepEqual([mini.width, mini.height, mini.format], [300, 188, 'webp'])
  assert.equal((await sharp(imagen.vista).metadata()).format, 'webp')
  assert.deepEqual(original, copia, 'el original no pierde un solo byte')
})

test('sharp: no amplía imágenes pequeñas y conserva transparencia PNG', async () => {
  const original = await sharp({
    create: {
      width: 180,
      height: 90,
      channels: 4,
      background: { r: 10, g: 80, b: 150, alpha: 0.4 },
    },
  })
    .png()
    .toBuffer()
  const imagen = await prepararImagen({ nombreOriginal: 'transparente.png', contenido: original })
  for (const buffer of [imagen.vista, imagen.miniatura]) {
    const m = await sharp(buffer).metadata()
    assert.deepEqual([m.width, m.height, m.hasAlpha], [180, 90, true])
    const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true })
    assert.equal(info.channels, 4)
    assert.ok(data[3] >= 100 && data[3] <= 104)
  }
})

test('sharp: corrige la orientación EXIF antes de reducir y elimina metadata de la vista', async () => {
  const original = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: 'white' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
  const imagen = await prepararImagen({ nombreOriginal: 'vertical.jpeg', contenido: original })
  assert.deepEqual([imagen.datos.anchoOriginal, imagen.datos.altoOriginal], [1200, 2400])
  assert.deepEqual([imagen.datos.ancho, imagen.datos.alto], [800, 1600])
  assert.equal((await sharp(imagen.vista).metadata()).orientation, undefined)
})

test('PDF/Office no se procesan; una imagen dañada se rechaza', async () => {
  for (const nombreOriginal of ['informe.pdf', 'acta.docx', 'planilla.xlsx'])
    assert.equal(
      await prepararImagen({ nombreOriginal, contenido: Buffer.from('bytes originales') }),
      null,
    )
  await assert.rejects(
    prepararImagen({ nombreOriginal: 'rota.jpg', contenido: Buffer.from('roto') }),
    (e) => e.status === 400,
  )
})

test('R2: originales privados e inalterados, derivados WebP internos, firmas cortas y attachment también para vistas', async () => {
  const config = leerConfiguracionR2({
    R2_ACCOUNT_ID: 'a'.repeat(32),
    R2_ACCESS_KEY_ID: 'prueba',
    R2_SECRET_ACCESS_KEY: 'prueba',
    R2_BUCKET: 'prueba-bucket',
  })
  const cliente = new S3Client({
    region: 'auto',
    credentials: { accessKeyId: 'prueba', secretAccessKey: 'prueba' },
  })
  const comandos = []
  cliente.send = async (c) => {
    comandos.push(c)
    return { Metadata: { 'imagen-v1': '{}' } }
  }
  const r2 = crearAlmacenamientoR2(config, cliente)
  try {
    const original = await sharp({
      create: { width: 1800, height: 900, channels: 3, background: 'white' },
    })
      .jpeg()
      .toBuffer()
    const resultado = await subirDocumentoProcesado(
      r2,
      { nombreOriginal: 'original.jpg', contenido: original },
      'siniestros/123',
    )
    assert.equal(comandos.length, 3)
    assert.deepEqual(comandos[0].input.Body, original)
    assert.ok(comandos[0].input.Metadata['imagen-v1'])
    assert.equal(comandos[1].input.Key, claveDerivada(resultado.objeto.clave, 'vista'))
    assert.equal(comandos[2].input.Key, claveDerivada(resultado.objeto.clave, 'miniatura'))
    for (const c of comandos) {
      assert.equal(c.input.ACL, undefined)
      assert.equal(c.input.CacheControl, 'private, no-store')
    }
    assert.equal(comandos[1].input.ContentType, 'image/webp')
    await assert.rejects(
      r2.subirDerivada('plantillas/ajena.webp', Buffer.from('x')),
      (e) => e.status === 400,
    )
    const firma = await r2.firmarDescarga(resultado.claves[1], 'vista.webp')
    assert.equal(firma.venceEnSegundos, 60)
    assert.ok(
      new URL(firma.url).searchParams.get('response-content-disposition').startsWith('attachment;'),
    )
    const pdf = Buffer.from('%PDF-1.4\nOriginal firmado')
    const antes = comandos.length
    await subirDocumentoProcesado(
      r2,
      { nombreOriginal: 'firmado.pdf', contenido: pdf },
      'siniestros/123',
    )
    assert.equal(comandos.length, antes + 1)
    assert.deepEqual(comandos.at(-1).input.Body, pdf)
  } finally {
    r2.cerrar()
  }
})

test('fallo de miniatura: compensa original y ambas variantes, incluso el PUT fallido', async () => {
  const imagen = await sharp({
    create: { width: 100, height: 50, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer()
  const claves = [],
    borradas = []
  const r2 = {
    subir: async () => ({ clave: 'siniestros/123/uuid.png' }),
    subirDerivada: async (clave) => {
      claves.push(clave)
      if (clave.includes('miniatura')) throw new Error('R2 caído')
    },
    eliminar: async (clave) => borradas.push(clave),
  }
  await assert.rejects(
    subirDocumentoProcesado(
      r2,
      { nombreOriginal: 'foto.png', contenido: imagen },
      'siniestros/123',
    ),
    /R2 caído/,
  )
  assert.deepEqual(borradas, [
    'siniestros/123/uuid.png',
    'siniestros/123/uuid.png.vista.webp',
    'siniestros/123/uuid.png.miniatura.webp',
  ])
})
