import { Router, type RequestHandler } from 'express'
import { idSchema } from '@cova/shared/schemas/comunes'
import { filtrosSiniestrosSchema } from '@cova/shared/schemas/siniestros'
import { datosCasoSchema } from '@cova/shared/schemas/siniestros-alta'
import { requerirRol, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import type { crearServicioAltaSiniestros } from './siniestros-alta.service.ts'
import type { crearServicioSiniestros } from './siniestros.service.ts'

// CU-09. Todos los roles; el servicio limita al gestor a sus siniestros (RF-17).
// GET /api/siniestros?pagina=&porPagina=&q=&estado=&aseguradora=&gestor=&bajas=&orden=
// GET /api/siniestros/opciones
// GET /api/siniestros/:id
// GET /api/siniestros/:id/partes
// Alta (solo administrador y superadministrador):
// GET  /api/siniestros/alta/opciones
// POST /api/siniestros/alta/datos-caso   valida el paso 1 (204 o el error con su campo)
export function crearSiniestrosRouter(deps: {
  servicio: ReturnType<typeof crearServicioSiniestros>
  alta: ReturnType<typeof crearServicioAltaSiniestros>
  requerirSesion: RequestHandler
}) {
  const { servicio, alta, requerirSesion } = deps
  const router = Router()
  router.use(requerirSesion, requerirRol('GESTOR', 'ADMINISTRADOR', 'SUPER_ADMINISTRADOR'))

  const soloAdministracion = requerirRol('ADMINISTRADOR', 'SUPER_ADMINISTRADOR')
  router.get('/alta/opciones', soloAdministracion, async (_req, res) => {
    res.json(await alta.opciones())
  })
  router.post('/alta/datos-caso', soloAdministracion, async (req, res) => {
    await alta.validarDatosCaso(datosCasoSchema.parse(req.body))
    res.status(204).end()
  })

  router.get('/', async (req, res) => {
    res.json(await servicio.listar(usuarioDeSesion(req), filtrosSiniestrosSchema.parse(req.query)))
  })

  router.get('/opciones', async (req, res) => {
    res.json(await servicio.opciones(usuarioDeSesion(req)))
  })

  router.get('/:id', async (req, res) => {
    res.json(await servicio.obtener(usuarioDeSesion(req), idSchema.parse(req.params.id)))
  })

  router.get('/:id/partes', async (req, res) => {
    res.json(await servicio.partes(usuarioDeSesion(req), idSchema.parse(req.params.id)))
  })

  return router
}
