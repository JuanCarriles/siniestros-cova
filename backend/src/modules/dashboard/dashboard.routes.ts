import { Router, type RequestHandler } from 'express'
import {
  consultaDashboardAdministradorSchema,
  asignarGestorDashboardSchema,
  consultaDashboardGestorSchema,
} from '@cova/shared/schemas/dashboard'
import { requerirRol, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import { idSchema } from '@cova/shared/schemas/comunes'
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
  if (admin) {
    const soloAdministracion = requerirRol('ADMINISTRADOR', 'SUPER_ADMINISTRADOR')
    router.get('/administrador', soloAdministracion, async (req, res) => {
      res.set('Cache-Control', 'no-store')
      res.json(
        await admin.obtener(
          usuarioDeSesion(req),
          consultaDashboardAdministradorSchema.parse(req.query),
        ),
      )
    })
    router.get('/administrador/gestores', soloAdministracion, async (req, res) => {
      res.set('Cache-Control', 'no-store')
      res.json(await admin.gestores(usuarioDeSesion(req)))
    })
    router.patch('/administrador/siniestros/:id/gestor', soloAdministracion, async (req, res) => {
      const { idUsuario } = asignarGestorDashboardSchema.parse(req.body)
      await admin.asignar(usuarioDeSesion(req), idSchema.parse(req.params.id), idUsuario)
      res.status(204).end()
    })
  }
  return router
}
