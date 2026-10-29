import { Router, type RequestHandler } from 'express'
import { consultaDashboardGestorSchema } from '@cova/shared/schemas/dashboard'
import { requerirRol, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import type { crearServicioDashboard } from './dashboard.service.ts'

export function crearDashboardRouter(deps: {
  servicio: ReturnType<typeof crearServicioDashboard>
  requerirSesion: RequestHandler
}) {
  const router = Router()
  router.use(deps.requerirSesion, requerirRol('GESTOR'))
  router.get('/gestor', async (req, res) => {
    const { paginaPericias } = consultaDashboardGestorSchema.parse(req.query)
    res.set('Cache-Control', 'no-store')
    res.json(await deps.servicio.obtenerGestor(usuarioDeSesion(req), paginaPericias))
  })
  return router
}
