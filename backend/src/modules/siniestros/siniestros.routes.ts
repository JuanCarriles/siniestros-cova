import { Router, type RequestHandler } from 'express'
import { idSchema } from '@cova/shared/schemas/comunes'
import { filtrosSiniestrosSchema } from '@cova/shared/schemas/siniestros'
import { requerirRol, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import type { crearServicioSiniestros } from './siniestros.service.ts'

// CU-09. Todos los roles; el servicio limita al gestor a sus siniestros (RF-17).
// GET /api/siniestros?pagina=&porPagina=&q=&estado=&aseguradora=&gestor=&bajas=&orden=
// GET /api/siniestros/opciones
// GET /api/siniestros/:id/partes
export function crearSiniestrosRouter(deps: {
  servicio: ReturnType<typeof crearServicioSiniestros>
  requerirSesion: RequestHandler
}) {
  const { servicio, requerirSesion } = deps
  const router = Router()
  router.use(requerirSesion, requerirRol('GESTOR', 'ADMINISTRADOR', 'SUPER_ADMINISTRADOR'))

  router.get('/', async (req, res) => {
    res.json(await servicio.listar(usuarioDeSesion(req), filtrosSiniestrosSchema.parse(req.query)))
  })

  router.get('/opciones', async (req, res) => {
    res.json(await servicio.opciones(usuarioDeSesion(req)))
  })

  router.get('/:id/partes', async (req, res) => {
    res.json(await servicio.partes(usuarioDeSesion(req), idSchema.parse(req.params.id)))
  })

  return router
}
