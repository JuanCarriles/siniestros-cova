import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { S3Client } from '@aws-sdk/client-s3'
import {
  prepararImagen,
  subirDocumentoProcesado,
  claveDerivada,
  clavesDocumento,
  leerDatosImagen,
  CALIDAD_IMAGEN,
} from '../src/modules/documentos/imagenes-documento.ts'
import { crearAlmacenamientoR2, nombreDescargaArchivo } from '../src/lib/r2.ts'
import { leerConfiguracionR2 } from '../src/config/r2.ts'

test('sharp: archivo 1600/80 y miniatura 300; proporción y WebP sin una copia adicional del original', async () => {
  const svg = Buffer.from(
    '<svg width="3200" height="2000" xmlns="http://www.w3.org/2000/svg"><rect width="3200" height="2000" fill="white"/><text x="100" y="250" font-size="100">ACTA DE SINIESTRO 2026-12345</text></svg>',
  )
  const original = await sharp(svg).jpeg({ quality: 95 }).toBuffer()
  const imagen = await prepararImagen({ nombreOriginal: 'Acta.jpg', contenido: original })
  assert.equal(CALIDAD_IMAGEN, 80)
  assert.deepEqual([imagen.datos.ancho, imagen.datos.alto], [1600, 1000])
  assert.deepEqual([imagen.datos.anchoOriginal, imagen.datos.altoOriginal], [3200, 2000])
  assert.equal(imagen.datos.tipoExtension, 'webp')
  assert.ok(imagen.contenido.byteLength < original.byteLength)
  const mini = await sharp(imagen.miniatura).metadata()
  assert.deepEqual([mini.width, mini.height, mini.format], [300, 188, 'webp'])
  assert.equal((await sharp(imagen.contenido).metadata()).format, 'webp')
})

test('imágenes pequeñas: no recomprime ni amplía el archivo; miniatura respeta tamaño y transparencia', async () => {
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
  assert.deepEqual(imagen.contenido, original)
  assert.equal(imagen.datos.tipoExtension, 'png')
  for (const buffer of [imagen.contenido, imagen.miniatura]) {
    const m = await sharp(buffer).metadata()
    assert.deepEqual([m.width, m.height, m.hasAlpha], [180, 90, true])
    const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true })
    assert.equal(info.channels, 4)
    assert.ok(data[3] >= 100 && data[3] <= 104)
  }
})

test('si WebP aumenta el tamaño se conserva PNG intacto, aunque supere 1600; miniatura eficiente', async () => {
  const width = 1800,
    height = 1800,
    raw = Buffer.alloc(width * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) raw[y * width + x] = ((x + y) % 2) * 255
  const original = await sharp(raw, { raw: { width, height, channels: 1 } })
    .png({ palette: true, colours: 2, compressionLevel: 9 })
    .toBuffer()
  const imagen = await prepararImagen({ nombreOriginal: 'patron.png', contenido: original })
  assert.deepEqual(imagen.contenido, original)
  assert.deepEqual(
    [imagen.datos.ancho, imagen.datos.alto, imagen.datos.tipoExtension],
    [1800, 1800, 'png'],
  )
  assert.equal(imagen.datos.tamanoBytes, original.length)
  assert.ok(imagen.miniatura.length < original.length)
})

test('EXIF: orienta antes de reducir; imágenes grandes transparentes conservan alfa', async () => {
  const original = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: 'white' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
  const imagen = await prepararImagen({ nombreOriginal: 'vertical.jpeg', contenido: original })
  assert.deepEqual([imagen.datos.anchoOriginal, imagen.datos.altoOriginal], [1200, 2400])
  assert.deepEqual([imagen.datos.ancho, imagen.datos.alto], [800, 1600])
  assert.equal((await sharp(imagen.contenido).metadata()).orientation, undefined)
  const png = await sharp({
    create: {
      width: 2400,
      height: 1600,
      channels: 4,
      background: { r: 10, g: 80, b: 150, alpha: 0.4 },
    },
  })
    .png()
    .toBuffer()
  const transparencia = await prepararImagen({ nombreOriginal: 'grande.png', contenido: png })
  assert.equal(transparencia.datos.tipoExtension, 'webp')
  assert.equal((await sharp(transparencia.contenido).metadata()).hasAlpha, true)
})

test('PDF/Office intactos; imagen corrupta y exceso de píxeles se rechazan', async () => {
  for (const nombreOriginal of ['informe.pdf', 'acta.docx', 'planilla.xlsx'])
    assert.equal(
      await prepararImagen({ nombreOriginal, contenido: Buffer.from('bytes originales') }),
      null,
    )
  await assert.rejects(
    prepararImagen({ nombreOriginal: 'rota.jpg', contenido: Buffer.from('roto') }),
    (e) => e.status === 400,
  )
  const grande = await sharp({
    create: { width: 7000, height: 6000, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer()
  await assert.rejects(
    prepararImagen({ nombreOriginal: 'gigante.png', contenido: grande }),
    (e) => e.status === 400,
  )
})

test('R2: exactamente dos PUT privados, tamaño real, metadatos v2, nombres y formatos públicos sin cambios', async () => {
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
    return {}
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
      { nombreOriginal: 'Acta policial.jpg', contenido: original },
      'siniestros/123',
    )
    assert.equal(comandos.length, 2)
    assert.equal(resultado.objeto.tipoExtension, 'webp')
    assert.equal(resultado.objeto.mimeType, 'image/webp')
    assert.equal(comandos[0].input.Key, resultado.objeto.clave)
    assert.equal(comandos[1].input.Key, claveDerivada(resultado.objeto.clave, 'miniatura'))
    assert.equal(resultado.objeto.tamanoBytes, BigInt(comandos[0].input.Body.length))
    assert.ok(
      comandos.every((c) => !Buffer.from(c.input.Body).equals(original)),
      'no sube el original adicional',
    )
    assert.ok(comandos.reduce((n, c) => n + c.input.Body.length, 0) < original.length)
    assert.equal(leerDatosImagen(comandos[0].input.Metadata).version, 2)
    for (const c of comandos) {
      assert.equal(c.input.ACL, undefined)
      assert.equal(c.input.CacheControl, 'private, no-store')
      assert.equal(c.input.ContentType, 'image/webp')
    }
    assert.equal(nombreDescargaArchivo('Acta policial.jpg', 'webp'), 'Acta policial.webp')
    assert.equal(nombreDescargaArchivo('a'.repeat(250) + '.jpg', 'webp').length, 255)
    await assert.rejects(
      r2.subirDerivada('plantillas/ajena.webp', Buffer.from('x')),
      (e) => e.status === 400,
    )
    await assert.rejects(
      r2.subir(
        { nombreOriginal: 'entrada.webp', contenido: await sharp(original).webp().toBuffer() },
        'siniestros/123',
      ),
      (e) => e.status === 400,
    )
    const firma = await r2.firmarDescarga(
      resultado.objeto.clave,
      nombreDescargaArchivo('Acta policial.jpg', 'webp'),
      'image/webp',
    )
    assert.equal(firma.venceEnSegundos, 60)
    assert.ok(
      new URL(firma.url).searchParams.get('response-content-disposition').startsWith('attachment;'),
    )
    const pdf = Buffer.from('%PDF-1.4 Original firmado'),
      antes = comandos.length
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

test('metadatos anteriores siguen resolviendo tres archivos; v2 solo principal y miniatura', () => {
  const v1 = {
    version: 1,
    anchoOriginal: 2400,
    altoOriginal: 1500,
    ancho: 1600,
    alto: 1000,
    tamanoBytes: 500,
  }
  assert.deepEqual(leerDatosImagen({ 'imagen-v1': JSON.stringify(v1) }), v1)
  assert.equal(clavesDocumento('altas/1/prueba.jpg', v1).length, 3)
  const v2 = { ...v1, version: 2, tipoExtension: 'jpg' }
  assert.equal(clavesDocumento('altas/1/prueba.jpg', v2).length, 2)
  assert.throws(
    () => leerDatosImagen({ 'imagen-v2': '{incorrecto' }),
    (e) => e.status === 503,
  )
})

test('fallo de miniatura compensa ambos objetos, incluido el PUT fallido', async () => {
  const original = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: 'white' },
  })
    .jpeg()
    .toBuffer()
  const subidas = [],
    borradas = []
  const r2 = {
    subir: async () => {
      throw new Error('No debe subir el original')
    },
    subirDerivada: async (clave) => {
      subidas.push(clave)
      if (clave.includes('miniatura')) throw new Error('R2 caído')
    },
    eliminar: async (clave) => borradas.push(clave),
  }
  await assert.rejects(
    subirDocumentoProcesado(
      r2,
      { nombreOriginal: 'foto.jpg', contenido: original },
      'siniestros/123',
    ),
    /R2 caído/,
  )
  assert.equal(subidas.length, 2)
  assert.deepEqual(borradas, subidas)
})
