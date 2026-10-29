import type { RequestHandler } from 'express'
import multer from 'multer'
import { PLANTILLA_MAX_BYTES } from '@cova/shared/schemas/plantillas'
import { HttpError } from '../utils/httpError.ts'

// Busboy interpreta nombres como latin1; los navegadores mandan UTF-8.
export function nombreOriginalUtf8(nombre: string) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(nombre, 'latin1'))
  } catch {
    return nombre
  }
}

/**
 * Recibe un único archivo en el campo "archivo" (multipart), en memoria y con el mismo máximo que las plantillas.
 * Los errores llegan como mensajes para el usuario.
 */
export function recibirArchivo(): RequestHandler {
  const recibir = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PLANTILLA_MAX_BYTES, files: 1, fields: 0, parts: 1 },
  }).single('archivo')
  return (req, res, next) => {
    recibir(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError)
        return next(
          new HttpError(
            error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
            error.code === 'LIMIT_FILE_SIZE'
              ? 'El archivo supera el máximo de 10 MB.'
              : 'Enviá un único archivo por vez.',
          ),
        )
      if (error)
        return next(new HttpError(400, 'No se pudo recibir el archivo. Volvé a seleccionarlo.'))
      next()
    })
  }
}
