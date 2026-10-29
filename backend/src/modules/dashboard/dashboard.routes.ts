import { Router, type RequestHandler } from 'express'
import {
  consultaDashboardAdministradorSchema,
  consultaDashboardGestorSchema,
} from '@cova/shared/schemas/dashboard'
import { requerirRol, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import type { crearServicioDashboardAdministrador } from './dashboard-administrador.service.ts'
import type { crearServicioDashboard } from './dashboard.service.ts'

export function crearDashboardRouter(deps: {
  servicio: ReturnType<typeof crearServicioDashboard>
  administrador?: ReturnType<typeof crearServicioDashboardAdministrador>
  requerirSesion: RequestHandler
}) {
  const router = Router()
  router.use(deps.requerirSesion)
  router.get('/gestor', requerirRol('GESTOR'), async (req, res) => {
    const { paginaPericias } = consultaDashboardGestorSchema.parse(req.query)
    res.set('Cache-Control', 'no-store')
    res.json(await deps.servicio.obtenerGestor(usuarioDeSesion(req), paginaPericias))
  })
  const admin = deps.administrador
  if (admin)
    router.get(
      '/administrador',
      requerirRol('ADMINISTRADOR', 'SUPER_ADMINISTRADOR'),
      async (req, res) => {
        res.set('Cache-Control', 'no-store')
        res.json(
          await admin.obtener(
            usuarioDeSesion(req),
            consultaDashboardAdministradorSchema.parse(req.query),
          ),
        )
      },
    )
  return router
}
