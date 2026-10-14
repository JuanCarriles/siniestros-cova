import assert from 'node:assert/strict'
import test from 'node:test'
import { S3Client } from '@aws-sdk/client-s3'
import { leerConfiguracionR2 } from '../src/config/r2.ts'
import { crearAlmacenamientoR2 } from '../src/lib/r2.ts'
import { crearServicioDocumentos } from '../src/modules/documentos/documentos.service.ts'

const variables = { R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'solo-prueba',
  R2_SECRET_ACCESS_KEY: 'secreto-de-prueba', R2_BUCKET: 'bucket-prueba' }
const archivo = { nombreOriginal: 'informe.pdf', contenido: Buffer.from('%PDF-1.4\nPrueba') }

function almacenamientoPrueba() {
  const config = leerConfiguracionR2(variables)
  const cliente = new S3Client({ region: 'auto', endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.R2_ACCESS_KEY_ID, secretAccessKey: config.R2_SECRET_ACCESS_KEY } })
  const comandos = []
  cliente.send = async comando => { comandos.push(comando); return {} }
  return { almacenamiento: crearAlmacenamientoR2(config, cliente), comandos, cliente }
}

test('configuración: credenciales obligatorias, endpoint de la cuenta y vencimiento corto', () => {
  assert.equal(leerConfiguracionR2(variables).R2_SIGNED_URL_TTL_SECONDS, 60)
  for (const cambio of [{ R2_SECRET_ACCESS_KEY: '' }, { R2_ENDPOINT: 'https://otra-web.example' },
    { R2_SIGNED_URL_TTL_SECONDS: '301' }, { R2_SIGNED_URL_TTL_SECONDS: '0' }, { UPLOAD_ALLOWED_EXT: 'exe' }]) {
    assert.throws(() => leerConfiguracionR2({ ...variables, ...cambio }), error =>
      error.message.includes('Configuración R2 inválida') && !error.message.includes(variables.R2_SECRET_ACCESS_KEY))
  }
})

test('subida: clave UUID, tamaño real, contenido privado y ninguna URL en los metadatos', async () => {
  const { almacenamiento, comandos } = almacenamientoPrueba()
  const a = await almacenamiento.subir(archivo, 'siniestros/12')
  const b = await almacenamiento.subir(archivo, 'siniestros/12')
  assert.match(a.clave, /^siniestros\/12\/[0-9a-f-]{36}\.pdf$/)
  assert.notEqual(a.clave, b.clave)
  assert.equal(a.tamanoBytes, BigInt(archivo.contenido.byteLength))
  assert.equal(a.url, undefined)
  assert.equal(comandos[0].input.ACL, undefined)
  assert.equal(comandos[0].input.CacheControl, 'private, no-store')
  assert.equal(comandos[0].input.ContentLength, archivo.contenido.byteLength)
  assert.deepEqual(comandos[0].input.Body, archivo.contenido)
  almacenamiento.cerrar()
})

test('subida: rechaza vacíos, exceso de tamaño, extensiones y nombres inválidos antes de enviar', async () => {
  const { almacenamiento, comandos } = almacenamientoPrueba()
  for (const entrada of [{ ...archivo, contenido: Buffer.alloc(0) }, { ...archivo, contenido: Buffer.alloc(10 * 1024 * 1024 + 1) },
    { ...archivo, nombreOriginal: 'ejecutable.exe' }, { ...archivo, nombreOriginal: '../informe.pdf' },
    { ...archivo, nombreOriginal: 'informe\r\n.pdf' }]) {
    await assert.rejects(almacenamiento.subir(entrada, 'plantillas'))
  }
  assert.equal(comandos.length, 0)
  almacenamiento.cerrar()
})

test('firma real del SDK: GET, 60 segundos y descarga como adjunto; no necesita hacer pública la URL base', async () => {
  const { almacenamiento, comandos } = almacenamientoPrueba()
  const descarga = await almacenamiento.firmarDescarga('plantillas/archivo.pdf', 'informe.pdf')
  const url = new URL(descarga.url)
  assert.equal(url.searchParams.get('X-Amz-Expires'), '60')
  assert.ok(url.searchParams.has('X-Amz-Signature'))
  assert.match(url.searchParams.get('response-content-disposition'), /^attachment;/)
  assert.equal(url.searchParams.get('response-cache-control'), 'private, no-store')
  assert.equal(comandos.length, 0, 'firmar no demuestra conectividad con R2')
  await assert.rejects(almacenamiento.firmarDescarga('https://example.com/a.pdf', 'a.pdf'))
  almacenamiento.cerrar()
})

function servicioPrueba({ denegar = false, fallaBase = false, eliminado = false } = {}) {
  const llamadas = []
  let documento
  const prisma = {
    usuario: { findFirst: async () => ({ id: 1 }) },
    siniestro: { findFirst: async () => ({ id: 2 }) },
    documentoSiniestro: {
      create: async ({ data }) => { llamadas.push('guardar'); if (fallaBase) throw Error('fallo'); documento = { id: 3, ...data }; return documento },
      findFirst: async ({ where }) => { assert.equal(where.eliminado, false); return eliminado ? null : documento },
    },
    documentoPlantilla: {
      create: async ({ data }) => { documento = { id: 3, ...data }; return documento },
      findFirst: async () => documento,
    },
  }
  const almacenamiento = {
    subir: async (_archivo, carpeta) => { llamadas.push('subir'); return {
      clave: `${carpeta}/uuid.pdf`, nombreOriginal: 'informe.pdf', tipoExtension: 'pdf', mimeType: 'application/pdf', tamanoBytes: 10n,
    } },
    eliminar: async clave => llamadas.push(`eliminar:${clave}`),
    firmarDescarga: async clave => { llamadas.push(`firmar:${clave}`); return { url: 'temporal', venceEnSegundos: 60 } },
  }
  const servicio = crearServicioDocumentos({ prisma, almacenamiento, autorizar: async acceso => {
    llamadas.push('autorizar'); if (denegar === true || denegar === acceso.accion) throw Error('Acceso denegado')
  } })
  return { servicio, llamadas }
}

test('servicio: guarda sólo la clave y firma usando el registro consultado', async () => {
  const { servicio, llamadas } = servicioPrueba()
  const documento = await servicio.subir({ idUsuario: 1, destino: { tipo: 'siniestro', idSiniestro: 2 }, archivo })
  assert.equal(documento.urlArchivoSinDominio, 'siniestros/2/uuid.pdf')
  assert.equal(documento.tamanoBytes, '10')
  assert.equal(documento.url, undefined)
  await servicio.descargar({ idUsuario: 1, tipo: 'siniestro', idDocumento: 3 })
  assert.deepEqual(llamadas, ['autorizar', 'subir', 'guardar', 'autorizar', 'firmar:siniestros/2/uuid.pdf'])
})

test('plantillas: el campo histórico urlArchivo también guarda una clave relativa', async () => {
  const { servicio } = servicioPrueba()
  const plantilla = await servicio.subir({ idUsuario: 1, destino: { tipo: 'plantilla' }, archivo })
  assert.equal(plantilla.urlArchivo, 'plantillas/uuid.pdf')
  await servicio.descargar({ idUsuario: 1, tipo: 'plantilla', idDocumento: 3 })
})

test('servicio: la denegación evita subir archivos; la baja evita firmar descargas', async () => {
  const denegado = servicioPrueba({ denegar: true })
  await assert.rejects(denegado.servicio.subir({ idUsuario: 1, destino: { tipo: 'plantilla' }, archivo }))
  assert.deepEqual(denegado.llamadas, ['autorizar'])
  const baja = servicioPrueba({ eliminado: true })
  await assert.rejects(baja.servicio.descargar({ idUsuario: 1, tipo: 'siniestro', idDocumento: 3 }), { status: 404 })
  assert.equal(baja.llamadas.length, 0)
})

test('servicio: si Prisma falla después de subir, compensa eliminando sólo la clave recién creada', async () => {
  const { servicio, llamadas } = servicioPrueba({ fallaBase: true })
  await assert.rejects(servicio.subir({ idUsuario: 1, destino: { tipo: 'siniestro', idSiniestro: 2 }, archivo }), { status: 503 })
  assert.deepEqual(llamadas, ['autorizar', 'subir', 'guardar', 'eliminar:siniestros/2/uuid.pdf'])
})

test('servicio: un usuario sin permiso de descarga nunca obtiene una firma', async () => {
  const { servicio, llamadas } = servicioPrueba({ denegar: 'descargar' })
  await servicio.subir({ idUsuario: 1, destino: { tipo: 'siniestro', idSiniestro: 2 }, archivo })
  await assert.rejects(servicio.descargar({ idUsuario: 1, tipo: 'siniestro', idDocumento: 3 }), /Acceso denegado/)
  assert.ok(!llamadas.some(llamada => llamada.startsWith('firmar:')))
})
