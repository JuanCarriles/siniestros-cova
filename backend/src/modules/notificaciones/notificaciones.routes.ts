import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { consultaNotificacionesSchema } from '@cova/shared/schemas/bandeja-notificaciones'
import { idSchema } from '@cova/shared/schemas/comunes'
import { requerirRol, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import type { crearServicioNotificaciones } from './notificaciones.service.ts'

export function crearNotificacionesRouter(deps: {
  requerirSesion: RequestHandler
  servicio: ReturnType<typeof crearServicioNotificaciones>
}) {
  const router = Router()
  router.use(deps.requerirSesion, requerirRol('GESTOR', 'ADMINISTRADOR', 'SUPER_ADMINISTRADOR'))
  router.get('/', async (req, res) => {
    const { pagina } = consultaNotificacionesSchema.parse(req.query)
    res.set('Cache-Control', 'no-store')
    res.json(await deps.servicio.listar(usuarioDeSesion(req), pagina))
  })
  router.patch('/:id/lectura', async (req, res) => {
    z.strictObject({}).parse(req.body ?? {})
    await deps.servicio.leer(usuarioDeSesion(req), idSchema.parse(req.params.id))
    res.status(204).end()
  })
  return router
}
