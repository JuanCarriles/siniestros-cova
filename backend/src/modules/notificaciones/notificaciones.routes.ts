import { Router, type RequestHandler } from 'express'
import {
  consultaNotificacionesSchema,
  marcarLecturaSchema,
  marcarRevisionSchema,
  lecturasNotificacionesSchema,
} from '@cova/shared/schemas/bandeja-notificaciones'
import { idSchema } from '@cova/shared/schemas/comunes'
import { requerirRol, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import type { crearServicioNotificaciones } from './notificaciones.service.ts'

export function crearNotificacionesRouter(deps: {
  requerirSesion: RequestHandler
  servicio: ReturnType<typeof crearServicioNotificaciones>
}) {
  const router = Router()
  router.use(
    deps.requerirSesion,
    requerirRol('GESTOR', 'ADMINISTRADOR', 'SUPER_ADMINISTRADOR'),
    (_req, res, next) => {
      res.set('Cache-Control', 'no-store')
      next()
    },
  )
  router.get('/', async (req, res) => {
    res.json(
      await deps.servicio.listar(
        usuarioDeSesion(req),
        consultaNotificacionesSchema.parse(req.query),
      ),
    )
  })
  router.patch('/lecturas', async (req, res) => {
    await deps.servicio.leerVarias(
      usuarioDeSesion(req),
      lecturasNotificacionesSchema.parse(req.body),
    )
    res.status(204).end()
  })
  router.patch('/:id/lectura', async (req, res) => {
    const { leida } = marcarLecturaSchema.parse(req.body ?? {})
    await deps.servicio.leer(usuarioDeSesion(req), idSchema.parse(req.params.id), leida)
    res.status(204).end()
  })
  router.patch('/:id/revision', async (req, res) => {
    const { revisada } = marcarRevisionSchema.parse(req.body)
    await deps.servicio.revisar(usuarioDeSesion(req), idSchema.parse(req.params.id), revisada)
    res.status(204).end()
  })
  return router
}
