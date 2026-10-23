import { Router, type RequestHandler } from 'express'
import multer from 'multer'
import { altaPlantillaSchema, PLANTILLA_MAX_BYTES } from '@cova/shared/schemas/plantillas'
import { idSchema } from '@cova/shared/schemas/comunes'
import { requerirRol, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import { HttpError } from '../../utils/httpError.ts'
import type { crearServicioPlantillas } from './plantillas.service.ts'

// Busboy interpreta nombres como latin1; los navegadores mandan UTF-8.
function nombreOriginal(nombre: string) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(nombre, 'latin1'))
  } catch {
    return nombre
  }
}

export function crearPlantillasRouter(deps: {
  servicio: ReturnType<typeof crearServicioPlantillas>
  requerirSesion: RequestHandler
}) {
  const { servicio, requerirSesion } = deps
  const router = Router()
  const recibir = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: PLANTILLA_MAX_BYTES,
      files: 1,
      fields: 2,
      parts: 3,
      fieldSize: 4096,
      fieldNameSize: 40,
    },
  }).single('archivo')
  const archivo: RequestHandler = (req, res, next) => {
    recibir(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        return next(
          new HttpError(
            error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
            error.code === 'LIMIT_FILE_SIZE'
              ? 'El archivo supera el máximo de 10 MB.'
              : 'Enviá un único archivo junto con su encabezado y descripción.',
          ),
        )
      }
      if (error)
        return next(new HttpError(400, 'No se pudo recibir el archivo. Volvé a seleccionarlo.'))
      next()
    })
  }
  router.use(requerirSesion, (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  router.get('/', async (req, res) => {
    res.json(await servicio.listar(usuarioDeSesion(req).id))
  })
  router.post(
    '/',
    requerirRol('ADMINISTRADOR', 'SUPER_ADMINISTRADOR'),
    archivo,
    async (req, res) => {
      const datos = altaPlantillaSchema.parse(req.body)
      if (!req.file) throw new HttpError(400, 'Elegí el archivo que querés cargar.')
      res.status(201).json(
        await servicio.subir(usuarioDeSesion(req).id, datos, {
          nombreOriginal: nombreOriginal(req.file.originalname),
          contenido: Uint8Array.from(req.file.buffer),
        }),
      )
    },
  )
  router.get('/:id/descarga', async (req, res) => {
    res.json(await servicio.descargar(usuarioDeSesion(req).id, idSchema.parse(req.params.id)))
  })
  return router
}
