import type { ErrorRequestHandler, RequestHandler } from 'express'
import { z } from 'zod'
import { isProd } from '../config/env.ts'
import { HttpError } from '../utils/httpError.ts'

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: `No existe la ruta ${req.method} ${req.originalUrl}` })
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details })
    return
  }

  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Datos inválidos', details: z.flattenError(err).fieldErrors })
    return
  }

  // JSON mal formado en el body
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido' })
    return
  }

  console.error(err)
  res
    .status(500)
    .json({ error: 'Error interno del servidor', ...(isProd ? {} : { message: String(err) }) })
}
