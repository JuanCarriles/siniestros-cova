import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { S3Client } from '@aws-sdk/client-s3'
import { leerConfiguracionR2 } from '../src/config/r2.ts'
import { crearAlmacenamientoR2 } from '../src/lib/r2.ts'
import { crearAppDemo } from '../src/dev/r2-demo/app.ts'
import { abrirRegistroDemo } from '../src/dev/r2-demo/registro.ts'

async function fixture(t, { vencido = false, corrupto = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'cova-r2-demo-'))
  const ruta = join(dir, 'archivos.json')
  const objetos = new Map()
  const config = leerConfiguracionR2({ R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'demo-id', R2_SECRET_ACCESS_KEY: 'demo-secret', R2_BUCKET: 'demo-bucket', UPLOAD_MAX_MB: '1' })
  const cliente = new S3Client({ region: 'auto', endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: 'demo-id', secretAccessKey: 'demo-secret' } })
  cliente.send = async command => {
    if (command.constructor.name === 'PutObjectCommand') objetos.set(command.input.Key, Buffer.from(command.input.Body))
    if (command.constructor.name === 'DeleteObjectCommand') objetos.delete(command.input.Key)
    return {}
  }
  const r2 = crearAlmacenamientoR2(config, cliente)
  const almacenamiento = { ...r2, firmarDescarga: async (...args) => {
    const resultado = await r2.firmarDescarga(...args)
    if (vencido) resultado.venceEn = new Date(Date.now() - 1000).toISOString()
    return resultado
  } }
  const registro = await abrirRegistroDemo(ruta, almacenamiento)
  const urls = []
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const puerto = server.address().port
  const base = `http://127.0.0.1:${puerto}`
  const app = crearAppDemo({ config, almacenamiento, registro, token: 'token-local-prueba', puerto, descargar: async url => {
    urls.push(url)
    if (vencido) return new Response('AccessDenied', { status: 403 })
    const clave = [...objetos.keys()].find(key => new URL(url).pathname.endsWith(`/${key}`))
    if (!clave) return new Response('', { status: 404 })
    return new Response(corrupto ? Buffer.from('cambio') : objetos.get(clave), { status: 200 })
  } })
  server.on('request', app)
  async function pedir(path, options = {}) {
    // HTTP nativo permite probar Host explícitamente, sin la normalización de fetch.
    return new Promise((resolve, reject) => {
      const req = request(`${base}${path}`, { method: options.method ?? 'GET', headers: {
        Host: `127.0.0.1:${puerto}`, Origin: base, 'X-Demo-Token': 'token-local-prueba',
        ...(options.body !== undefined ? { 'Content-Length': Buffer.byteLength(options.body) } : {}),
        ...options.headers,
      } }, res => {
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => resolve(new Response(res.statusCode === 204 ? null : Buffer.concat(chunks), {
          status: res.statusCode, headers: res.headers,
        })))
        res.on('error', reject)
      })
      req.on('error', reject)
      req.end(options.body)
    })
  }
  async function subir(nombre = 'foto.png', contenido = Buffer.from('contenido de prueba')) {
    const respuesta = await pedir('/api/files', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(nombre) }, body: contenido })
    return { status: respuesta.status, datos: await respuesta.json() }
  }
  t.after(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    r2.cerrar()
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()))
    assert.ok(basename(dir).startsWith('cova-r2-demo-'))
    await rm(dir, { recursive: true, force: true })
  })
  return { pedir, subir, ruta, objetos, config, almacenamiento, registro, urls, dir }
}

test('demo: subida binaria, registro persistente sin URLs, firma, verificación y limpieza', async t => {
  const f = await fixture(t)
  const subida = await f.subir('mi foto.png')
  assert.equal(subida.status, 201)
  const { archivo } = subida.datos
  assert.match(archivo.clave, /^pruebas\/.+\.png$/)
  const contenidoDisco = await readFile(f.ruta, 'utf8')
  assert.ok(!contenidoDisco.includes('https://') && !contenidoDisco.includes('demo-secret') && !contenidoDisco.includes('token-local-prueba'))
  const reabierto = await abrirRegistroDemo(f.ruta, f.almacenamiento)
  assert.equal(reabierto.listar()[0].id, archivo.id)
  const firmado = await f.pedir(`/api/files/${archivo.id}/link`, { method: 'POST' })
  assert.equal(firmado.headers.get('cache-control'), 'no-store')
  const enlace = await firmado.json()
  assert.equal(new URL(enlace.url).searchParams.get('X-Amz-Expires'), '60')
  const comprobacion = await (await f.pedir(`/api/files/${archivo.id}/check`, { method: 'POST' })).json()
  assert.equal(comprobacion.coincide, true)
  assert.equal(comprobacion.httpStatus, 200)
  const borrado = await f.pedir(`/api/files/${archivo.id}`, { method: 'DELETE' })
  assert.equal(borrado.status, 204)
  assert.equal(f.objetos.size, 0)
  assert.equal(JSON.parse(await readFile(f.ruta, 'utf8')).archivos.length, 0)
})

test('demo: bloquea otro host, otro origen, solicitudes cross-site y cambios sin token', async t => {
  const f = await fixture(t)
  for (const headers of [{ Host: 'atacante.example:3033' }, { Origin: 'https://atacante.example' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'X-Demo-Token': '' }]) {
    const respuesta = await f.pedir('/api/files', { method: 'POST', headers, body: 'contenido' })
    assert.equal(respuesta.status, 403)
  }
  assert.equal(f.objetos.size, 0)
})

test('demo: rechaza archivos vacíos, extensiones no admitidas, rutas y exceso de tamaño', async t => {
  const f = await fixture(t)
  for (const [nombre, contenido, estado] of [['foto.png', Buffer.alloc(0), 400], ['programa.exe', Buffer.from('x'), 400], ['../foto.png', Buffer.from('x'), 400], ['foto.png', Buffer.alloc(1024 * 1024 + 1), 413]]) {
    assert.equal((await f.subir(nombre, contenido)).status, estado)
  }
  assert.equal(f.objetos.size, 0)
})

test('demo: no firma, descarga ni elimina claves ajenas a su registro', async t => {
  const f = await fixture(t)
  const desconocido = randomUUID()
  for (const [path, method] of [[`/api/files/${desconocido}/link`, 'POST'], [`/api/files/${desconocido}/check`, 'POST'], [`/api/files/${desconocido}`, 'DELETE']]) {
    assert.equal((await f.pedir(path, { method })).status, 404)
  }
  const subida = await f.subir()
  assert.equal((await f.pedir(`/api/files/${subida.datos.archivo.id}/check`, { method: 'POST' })).status, 409)
  assert.equal(f.urls.length, 0)
})

test('demo: informa rechazo de un enlace vencido sin borrar el archivo', async t => {
  const f = await fixture(t, { vencido: true })
  const id = (await f.subir()).datos.archivo.id
  await f.pedir(`/api/files/${id}/link`, { method: 'POST' })
  const comprobacion = await (await f.pedir(`/api/files/${id}/check`, { method: 'POST' })).json()
  assert.deepEqual(comprobacion, { httpStatus: 403, vencido: true, coincide: false, bytes: 0 })
  assert.equal(f.objetos.size, 1)
})

test('demo: detecta contenido distinto al original', async t => {
  const f = await fixture(t, { corrupto: true })
  const id = (await f.subir()).datos.archivo.id
  await f.pedir(`/api/files/${id}/link`, { method: 'POST' })
  const comprobacion = await (await f.pedir(`/api/files/${id}/check`, { method: 'POST' })).json()
  assert.equal(comprobacion.coincide, false)
})

test('demo: serializa subidas concurrentes y compensa un fallo al guardar el registro', async t => {
  const f = await fixture(t)
  await Promise.all([f.subir('uno.png'), f.subir('dos.png')])
  assert.equal(JSON.parse(await readFile(f.ruta, 'utf8')).archivos.length, 2)
  const bloqueado = join(f.dir, 'bloqueado')
  const registro = await abrirRegistroDemo(join(bloqueado, 'archivos.json'), f.almacenamiento)
  await writeFile(bloqueado, 'Impide crear el directorio')
  await assert.rejects(registro.subir({ nombreOriginal: 'tres.png', contenido: Buffer.from('prueba') }), { status: 500 })
  assert.equal(f.objetos.size, 2)
})
