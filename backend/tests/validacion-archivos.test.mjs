import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { once } from 'node:events'
import { gzipSync } from 'node:zlib'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import express from 'express'
import { S3Client } from '@aws-sdk/client-s3'
import { ARCHIVO_MAX_BYTES, ARCHIVO_REQUISITOS } from '@cova/shared/schemas/archivos'
import { validarArchivoPlantilla } from '../src/modules/plantillas/validar-archivo.ts'
import { crearServicioDocumentosGestion } from '../src/modules/documentos/documentos-gestion.service.ts'
import { crearServicioArchivosDocumento } from '../src/modules/documentos/documentos-archivos.service.ts'
import { crearServicioCrearSiniestro } from '../src/modules/siniestros/siniestros-alta-crear.service.ts'
import { crearSiniestrosRouter } from '../src/modules/siniestros/siniestros.routes.ts'
import { crearServicioPlantillas } from '../src/modules/plantillas/plantillas.service.ts'
import { crearPlantillasRouter } from '../src/modules/plantillas/plantillas.routes.ts'
import { crearAlmacenamientoR2 } from '../src/lib/r2.ts'
import { leerConfiguracionR2 } from '../src/config/r2.ts'
import { notFound, errorHandler } from '../src/middlewares/errorHandler.ts'

const fixture = (ext) => readFile(new URL(`./fixtures/plantillas/valido.${ext}`, import.meta.url))
const actor = {
  id: 1,
  nombres: 'Ana',
  apellidos: 'Prueba',
  email: 'ana@example.invalid',
  tipoUsuario: 'ADMINISTRADOR',
}
function requisitos(mensaje) {
  assert.ok(mensaje.includes(ARCHIVO_REQUISITOS), mensaje)
}
async function servidor() {
  const documentos = [],
    objetos = new Map(),
    puts = []
  const config = leerConfiguracionR2({
    R2_ACCOUNT_ID: 'a'.repeat(32),
    R2_ACCESS_KEY_ID: 'prueba',
    R2_SECRET_ACCESS_KEY: 'prueba',
    R2_BUCKET: 'prueba-bucket',
  })
  const cliente = new S3Client({
    region: 'auto',
    endpoint: config.R2_ENDPOINT || `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: 'prueba', secretAccessKey: 'prueba' },
  })
  cliente.send = async (comando) => {
    const c = comando.input
    if (comando.constructor.name === 'PutObjectCommand') {
      puts.push(c)
      objetos.set(c.Key, c)
      return {}
    }
    if (comando.constructor.name === 'DeleteObjectCommand') {
      objetos.delete(c.Key)
      return {}
    }
    if (comando.constructor.name === 'HeadObjectCommand')
      return { Metadata: objetos.get(c.Key)?.Metadata }
    return {}
  }
  const r2 = crearAlmacenamientoR2(config, cliente)
  const siniestro = {
    id: 1,
    idUsuario: 1,
    numeroSiniestro: 'PRUEBA-1',
    numeroPoliza: 'POL',
    carpetaR2: null,
    eliminado: false,
    eliminacionEnCurso: false,
    estadoSiniestro: { esCierre: false },
  }
  const prisma = {
    usuario: { findFirst: async () => actor, findMany: async () => [] },
    siniestro: {
      findUnique: async ({ where }) => (where.carpetaR2 ? null : siniestro),
      findUniqueOrThrow: async () => siniestro,
      update: async ({ data }) => Object.assign(siniestro, data),
    },
    documentoSiniestro: {
      findUnique: async ({ where }) => documentos.find((d) => d.idCarga === where.idCarga) || null,
      findFirst: async ({ where }) =>
        where.id
          ? documentos.find((d) => d.id === where.id && d.idSiniestro === where.idSiniestro) || null
          : null,
      create: async ({ data }) => {
        const d = { id: documentos.length + 1, ...data }
        documentos.push(d)
        return d
      },
    },
    documentoPlantilla: {
      create: async ({ data }) => ({ id: 1, ...data, fechaCarga: new Date(), usuario: actor }),
    },
    historialSiniestro: { create: async () => ({}) },
    $queryRaw: async () => [],
  }
  const transaccion = (trabajo) => trabajo(prisma)
  const carga = crearServicioDocumentosGestion({ transaccion, almacenamiento: () => r2 })
  const alta = crearServicioCrearSiniestro({
    transaccion,
    almacenamiento: () => r2,
    enviarAvisoAsignacion: async () => {},
    urlSistema: 'https://example.invalid',
  })
  const requerirSesion = (req, _res, next) => {
    req.usuario = actor
    next()
  }
  const app = express()
  app.use(express.json())
  app.use(
    '/api/siniestros',
    crearSiniestrosRouter({
      documentosCarga: carga,
      documentosArchivos: crearServicioArchivosDocumento(prisma, () => r2),
      creacion: alta,
      requerirSesion,
    }),
  )
  app.use(
    '/api/plantillas',
    crearPlantillasRouter({
      servicio: crearServicioPlantillas({ prisma, almacenamiento: () => r2 }),
      requerirSesion,
    }),
  )
  app.use(notFound, errorHandler)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    base,
    documentos,
    puts,
    objetos,
    async enviar(
      ruta,
      contenido,
      nombre = 'archivo.pdf',
      mime = 'application/octet-stream',
      compresion = 'identity',
    ) {
      const form = new FormData()
      form.append('archivo', new Blob([contenido], { type: mime }), nombre)
      if (ruta === '/api/plantillas') {
        form.append('encabezado', 'Documento')
        form.append('descripcion', 'Documento de prueba')
      }
      return fetch(base + ruta, {
        method: 'POST',
        headers: { 'X-Id-Carga': randomUUID(), 'X-Archivo-Compresion': compresion },
        body: form,
      })
    },
    async cerrar() {
      await new Promise((resolve) => server.close(resolve))
      r2.cerrar()
    },
  }
}

test('firmas: formatos reales, JPEG y mayúsculas; un nombre permitido no hace válido otro contenido', async () => {
  for (const ext of ['pdf', 'jpg', 'png', 'docx', 'xlsx'])
    await validarArchivoPlantilla({
      nombreOriginal: `archivo.${ext}`,
      contenido: await fixture(ext),
    })
  await validarArchivoPlantilla({ nombreOriginal: 'FOTO.JPEG', contenido: await fixture('jpg') })
  for (const archivo of [
    { nombreOriginal: 'ejecutable.pdf', contenido: Buffer.from('MZ ejecutable disfrazado') },
    {
      nombreOriginal: 'pagina.pdf',
      contenido: Buffer.from('<html><script>alert(1)</script></html>'),
    },
    { nombreOriginal: 'zip.docx', contenido: Buffer.from('PK\x03\x04 ZIP genérico incompleto') },
    { nombreOriginal: 'vacio.pdf', contenido: Buffer.alloc(0) },
  ])
    await assert.rejects(validarArchivoPlantilla(archivo), (e) => {
      assert.equal(e.status, 400)
      requisitos(e.message)
      return true
    })
})

test('HTTP: ficha, alta y plantillas rechazan tipo falso, vacío y exceso antes de escribir en R2', async (t) => {
  const api = await servidor()
  t.after(api.cerrar)
  const casos = [
    [Buffer.from('MZ falso PDF'), 'renombrado.pdf', 400],
    [Buffer.alloc(0), 'vacio.pdf', 400],
    [Buffer.alloc(ARCHIVO_MAX_BYTES + 1), 'grande.pdf', 413],
  ]
  for (const ruta of [
    '/api/siniestros/1/documentos',
    '/api/siniestros/alta/documentos',
    '/api/plantillas',
  ])
    for (const [buffer, nombre, status] of casos) {
      const r = await api.enviar(ruta, buffer, nombre, 'application/pdf')
      assert.equal(r.status, status)
      requisitos((await r.json()).error)
    }
  assert.equal(api.puts.length, 0)
  assert.equal(api.documentos.length, 0)
})

test('HTTP: ignora MIME declarado, acepta cinco formatos reales y el máximo exacto de 10 MB', async (t) => {
  const api = await servidor()
  t.after(api.cerrar)
  const imagenJpg = await sharp({
    create: { width: 30, height: 20, channels: 3, background: 'white' },
  })
    .jpeg()
    .toBuffer()
  const imagenPng = await sharp({
    create: { width: 30, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } },
  })
    .png()
    .toBuffer()
  for (const ruta of [
    '/api/siniestros/1/documentos',
    '/api/siniestros/alta/documentos',
    '/api/plantillas',
  ]) {
    for (const ext of ['pdf', 'jpg', 'png', 'docx', 'xlsx']) {
      const contenido = ext === 'jpg' ? imagenJpg : ext === 'png' ? imagenPng : await fixture(ext)
      const r = await api.enviar(ruta, contenido, `documento.${ext}`, 'text/javascript')
      assert.equal(r.status, 201, `${ruta}: ${ext}: ${await r.text()}`)
    }
    const exacto = Buffer.alloc(ARCHIVO_MAX_BYTES)
    ;(await fixture('pdf')).copy(exacto)
    const r = await api.enviar(ruta, exacto, 'maximo.pdf')
    assert.equal(r.status, 201, `${ruta}: ${await r.text()}`)
  }
  assert.equal(api.puts.find((p) => p.Key.endsWith('.pdf')).ContentType, 'application/pdf')
})

test('gzip: detecta los bytes descomprimidos y rechaza originales mayores al máximo con mensaje completo', async (t) => {
  const api = await servidor()
  t.after(api.cerrar)
  const grande = Buffer.alloc(ARCHIVO_MAX_BYTES + 1)
  ;(await fixture('pdf')).copy(grande)
  for (const [contenido, status] of [
    [gzipSync(grande), 413],
    [gzipSync(Buffer.from('MZ falso PDF')), 400],
    [Buffer.from('gzip roto'), 400],
  ]) {
    const r = await api.enviar(
      '/api/siniestros/1/documentos',
      contenido,
      'archivo.pdf',
      'application/pdf',
      'gzip',
    )
    assert.equal(r.status, status)
    requisitos((await r.json()).error)
  }
  assert.equal(api.puts.length, 0)
  const valido = await api.enviar(
    '/api/siniestros/1/documentos',
    gzipSync(await fixture('pdf')),
    'valido.pdf',
    'application/gzip',
    'gzip',
  )
  assert.equal(valido.status, 201)
})

test('attachment: objetos y URLs firmadas de originales, vistas y miniaturas; también sobre objetos anteriores inline', async (t) => {
  const api = await servidor()
  t.after(api.cerrar)
  const bytes = await sharp({
    create: { width: 1700, height: 1000, channels: 3, background: 'white' },
  })
    .jpeg()
    .toBuffer()
  const respuesta = await api.enviar(
    '/api/siniestros/1/documentos',
    bytes,
    'Inspección vehículo.pdf',
  )
  assert.equal(respuesta.status, 201)
  const { id } = await respuesta.json()
  assert.equal(api.puts.length, 2)
  for (const p of api.puts) {
    assert.match(p.ContentDisposition, /^attachment;/)
    assert.ok(p.ContentDisposition.includes("filename*=UTF-8''"))
  }
  for (const tipo of ['miniatura', 'vista', 'original']) {
    // Simula metadata de un objeto que existía antes de E6-03: la firma siempre fuerza attachment.
    for (const p of api.objetos.values()) {
      p.ContentDisposition = 'inline'
      p.ContentType = 'text/plain'
    }
    const r = await fetch(`${api.base}/api/siniestros/1/documentos/${id}/${tipo}`, {
      redirect: 'manual',
    })
    assert.equal(r.status, 302)
    const url = new URL(r.headers.get('location'))
    assert.match(url.searchParams.get('response-content-disposition'), /^attachment;/)
    const documento = api.documentos.find((d) => d.id === id)
    const esperada =
      tipo === 'original'
        ? documento.urlArchivoSinDominio
        : tipo === 'miniatura'
          ? documento.claveMiniatura
          : (documento.claveImagenOptimizada ?? documento.urlArchivoSinDominio)
    assert.ok(
      decodeURIComponent(url.pathname).endsWith('/' + esperada),
      `La ruta ${tipo} debe servir su versión correcta`,
    )
    if (tipo === 'original') {
      assert.equal(documento.claveImagenOptimizada, null)
      const metadata = await sharp(api.objetos.get(esperada).Body).metadata()
      assert.equal(metadata.width, 1600)
      assert.equal(metadata.format, 'webp')
    }

    assert.equal(url.searchParams.get('X-Amz-Expires'), '60')
    assert.equal(url.searchParams.get('response-content-type'), 'image/webp')
    if (tipo === 'original')
      assert.ok(url.searchParams.get('response-content-disposition').includes('Inspecci%C3%B3n'))
  }
})

test('proxy: el rechazo de Nginx mantiene el mismo máximo y los mismos formatos que shared', async () => {
  const conf = await readFile(
    new URL('../../frontend/nginx/snippets/app.conf', import.meta.url),
    'utf8',
  )
  const json = /return 413 '(.*?)';/.exec(conf)?.[1]
  requisitos(JSON.parse(json).error)
  assert.ok(conf.includes('error_page 413 = @archivo_grande;'))
})

test('contenido real: acepta nombres equivocados o sin extensión y guarda MIME/extensión canónicos en las tres subidas', async (t) => {
  const api = await servidor()
  t.after(api.cerrar)
  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: 'white' } })
    .png()
    .toBuffer()
  const casos = [
    [png, 'foto.jpg', 'png', 'image/png'],
    [await fixture('pdf'), 'informe', 'pdf', 'application/pdf'],
    [await fixture('pdf'), 'nombre-erroneo.exe', 'pdf', 'application/pdf'],
    [
      await fixture('docx'),
      'carta.xlsx',
      'docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    [
      await fixture('xlsx'),
      'planilla.pdf',
      'xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  ]
  for (const ruta of [
    '/api/siniestros/1/documentos',
    '/api/siniestros/alta/documentos',
    '/api/plantillas',
  ])
    for (const [contenido, nombre, extension, mime] of casos) {
      const antes = api.puts.length
      const respuesta = await api.enviar(ruta, contenido, nombre, 'application/x-msdownload')
      assert.equal(respuesta.status, 201, `${ruta}: ${nombre}: ${await respuesta.clone().text()}`)
      const principal = api.puts.slice(antes).find((p) => !p.Key.endsWith('.miniatura.webp'))
      assert.ok(principal.Key.endsWith('.' + extension))
      assert.equal(principal.ContentType, mime)
      assert.deepEqual(Buffer.from(principal.Body), contenido)
      assert.match(principal.ContentDisposition, /^attachment;/)
      const datos = await respuesta.json()
      const guardado = ruta.endsWith('/1/documentos')
        ? api.documentos.find((d) => d.id === datos.id)
        : datos
      assert.equal(guardado.nombreOriginal, nombre)
      assert.equal(guardado.tipoExtension, extension)
      if ('mimeType' in guardado) assert.equal(guardado.mimeType, mime)
    }
})

test('firmas: JPEG principal fuerza image/jpeg y miniatura fuerza image/webp, aunque R2 tenga MIME incorrecto', async (t) => {
  const api = await servidor()
  t.after(api.cerrar)
  const bytes = await sharp({ create: { width: 40, height: 30, channels: 3, background: 'white' } })
    .jpeg()
    .toBuffer()
  const r = await api.enviar('/api/siniestros/1/documentos', bytes, 'imagen.pdf', 'application/pdf')
  assert.equal(r.status, 201)
  const { id } = await r.json()
  for (const p of api.objetos.values()) {
    p.ContentType = 'text/html'
    p.ContentDisposition = 'inline'
  }
  for (const tipo of ['original', 'vista', 'miniatura']) {
    const respuesta = await fetch(`${api.base}/api/siniestros/1/documentos/${id}/${tipo}`, {
      redirect: 'manual',
    })
    assert.equal(respuesta.status, 302)
    const url = new URL(respuesta.headers.get('location'))
    assert.equal(
      url.searchParams.get('response-content-type'),
      tipo === 'miniatura' ? 'image/webp' : 'image/jpeg',
    )
    assert.match(url.searchParams.get('response-content-disposition'), /^attachment;/)
    assert.ok(
      url.searchParams
        .get('response-content-disposition')
        .includes(tipo === 'miniatura' ? 'imagen-miniatura.webp' : 'imagen.jpg'),
    )
  }
})
