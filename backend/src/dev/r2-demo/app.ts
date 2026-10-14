import { createHash, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import express from 'express'
import type { ErrorRequestHandler } from 'express'
import helmet from 'helmet'
import { z } from 'zod'
import type { ConfiguracionR2 } from '../../config/r2.ts'
import type { AlmacenamientoR2 } from '../../lib/r2.ts'
import { HttpError } from '../../utils/httpError.ts'
import type { RegistroDemo } from './registro.ts'

type Enlace = Awaited<ReturnType<AlmacenamientoR2['firmarDescarga']>>

export function crearAppDemo(deps: {
  almacenamiento: AlmacenamientoR2; registro: RegistroDemo; config: ConfiguracionR2;
  token: string; puerto: number; descargar?: typeof fetch
}) {
  if (process.env.NODE_ENV === 'production') throw new Error('La demo de R2 sólo se puede usar en desarrollo.')
  const { almacenamiento, registro, config, token, puerto } = deps
  const descargar = deps.descargar ?? fetch
  const hosts = [`127.0.0.1:${puerto}`, `localhost:${puerto}`]
  const origenes = hosts.map(host => `http://${host}`)
  const enlaces = new Map<string, Enlace>() // Sólo en memoria; las URLs no se guardan en disco.
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet({
    strictTransportSecurity: false,
    referrerPolicy: { policy: 'no-referrer' },
    contentSecurityPolicy: { directives: {
      'default-src': ["'self'"], 'script-src': ["'self'"], 'style-src': ["'self'"],
      'img-src': ["'self'", 'blob:', 'data:'], 'connect-src': ["'self'"],
      'frame-ancestors': ["'none'"], 'upgrade-insecure-requests': null,
    } },
  }))
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!hosts.includes(req.headers.host ?? '')) return res.status(403).json({ error: 'Acceso sólo desde esta computadora.' })
    next()
  })
  app.use('/api', (req, res, next) => {
    const origen = req.get('origin')
    if ((origen && !origenes.includes(origen)) || req.get('sec-fetch-site') === 'cross-site') {
      return res.status(403).json({ error: 'Origen no permitido.' })
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const recibido = Buffer.from(req.get('x-demo-token') ?? '')
      const esperado = Buffer.from(token)
      if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) {
        return res.status(403).json({ error: 'La sesión de prueba cambió. Recargá esta página.' })
      }
    }
    next()
  })

  app.get('/api/context', (_req, res) => res.json({
    token, bucket: config.R2_BUCKET, maxBytes: config.UPLOAD_MAX_MB * 1024 * 1024,
    extensiones: config.UPLOAD_ALLOWED_EXT, segundos: config.R2_SIGNED_URL_TTL_SECONDS,
  }))
  app.get('/api/files', (_req, res) => res.json({ archivos: registro.listar() }))
  app.post('/api/files', express.raw({ type: 'application/octet-stream', limit: `${config.UPLOAD_MAX_MB}mb`, inflate: false }), async (req, res) => {
    if (!Buffer.isBuffer(req.body)) throw new HttpError(415, 'Seleccioná un archivo para subir.')
    let nombreOriginal: string
    try { nombreOriginal = decodeURIComponent(req.get('x-file-name') ?? '') }
    catch { throw new HttpError(400, 'El nombre del archivo no es válido.') }
    const archivo = await registro.subir({ nombreOriginal, contenido: new Uint8Array(req.body) })
    res.status(201).json({ archivo })
  })
  app.post('/api/files/:id/link', async (req, res) => {
    const archivo = registro.buscar(z.uuid().parse(req.params.id))
    const enlace = await almacenamiento.firmarDescarga(archivo.clave, archivo.nombreOriginal)
    enlaces.set(archivo.id, enlace)
    res.json(enlace)
  })
  app.post('/api/files/:id/check', async (req, res) => {
    const archivo = registro.buscar(z.uuid().parse(req.params.id))
    const enlace = enlaces.get(archivo.id)
    if (!enlace) throw new HttpError(409, 'Primero generá un enlace de descarga.')
    // La dirección procede del SDK, nunca de una URL enviada por el navegador.
    let respuesta: Response
    try { respuesta = await descargar(enlace.url, { signal: AbortSignal.timeout(30_000), redirect: 'error' }) }
    catch { throw new HttpError(502, 'No se pudo consultar la descarga en R2. Intentá nuevamente.') }
    const vencido = Date.now() >= Date.parse(enlace.venceEn)
    if (!respuesta.ok) {
      await respuesta.body?.cancel()
      res.json({ httpStatus: respuesta.status, vencido, coincide: false, bytes: 0 })
      return
    }
    const hash = createHash('sha256')
    const reader = respuesta.body?.getReader()
    if (!reader) throw new HttpError(502, 'R2 no devolvió el contenido del archivo.')
    let bytes = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > Number(archivo.tamanoBytes)) throw new HttpError(502, 'El tamaño descargado no coincide con el original.')
        hash.update(chunk.value)
      }
    } finally { await reader.cancel().catch(() => {}) }
    res.json({ httpStatus: respuesta.status, vencido, bytes,
      coincide: bytes === Number(archivo.tamanoBytes) && hash.digest('hex') === archivo.sha256 })
  })
  app.delete('/api/files/:id', async (req, res) => {
    const id = z.uuid().parse(req.params.id)
    await registro.eliminar(id)
    enlaces.delete(id)
    res.status(204).end()
  })
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Operación de prueba no disponible.' }))
  app.use(express.static(fileURLToPath(new URL('./public/', import.meta.url)), { etag: false, index: 'index.html' }))
  const errores: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) { res.status(error.status).json({ error: error.message }); return }
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Los datos del archivo no son válidos.' }); return }
    if (error?.type === 'entity.too.large') { res.status(413).json({ error: `El archivo supera el límite de ${config.UPLOAD_MAX_MB} MB.` }); return }
    if (error?.type === 'encoding.unsupported') { res.status(415).json({ error: 'Formato de solicitud no admitido.' }); return }
    res.status(500).json({ error: 'No se pudo completar la operación. Revisá la conexión y el registro local de la demo.' })
  }
  app.use(errores)
  return app
}
