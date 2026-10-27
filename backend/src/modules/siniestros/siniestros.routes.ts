import { Router, type RequestHandler } from 'express'
import { idSchema } from '@cova/shared/schemas/comunes'
import {
  confirmarBajaSiniestroSchema,
  confirmarSiniestroSchema,
  filtrosSiniestrosSchema,
} from '@cova/shared/schemas/siniestros'
import { datosCasoSchema } from '@cova/shared/schemas/siniestros-alta'
import { requerirRol, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import type { crearServicioAltaSiniestros } from './siniestros-alta.service.ts'
import type { crearServicioBajasSiniestros } from './siniestros-bajas.service.ts'
import type { crearServicioSiniestros } from './siniestros.service.ts'

// CU-09. Todos los roles; el servicio limita al gestor a sus siniestros (RF-17).
// GET /api/siniestros?pagina=&porPagina=&q=&estado=&aseguradora=&gestor=&activos=&bajas=&orden=
// GET /api/siniestros/opciones
// GET /api/siniestros/:id
// GET /api/siniestros/:id/partes
// Alta (solo administrador y superadministrador):
// GET  /api/siniestros/alta/opciones
// POST /api/siniestros/alta/datos-caso   valida el paso 1 (204 o el error con su campo)
export function crearSiniestrosRouter(deps: {
  operaciones: ReturnType<typeof crearServicioBajasSiniestros>
  servicio: ReturnType<typeof crearServicioSiniestros>
  alta: ReturnType<typeof crearServicioAltaSiniestros>
  requerirSesion: RequestHandler
}) {
  const { servicio, alta, operaciones, requerirSesion } = deps
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

  router.patch(
    '/:id/baja',
    requerirRol('ADMINISTRADOR', 'SUPER_ADMINISTRADOR'),
    async (req, res) => {
      confirmarBajaSiniestroSchema.parse(req.body ?? {})
      await operaciones.darDeBaja(usuarioDeSesion(req), idSchema.parse(req.params.id))
      res.status(204).end()
    },
  )
  router.patch('/:id/reactivacion', soloAdministracion, async (req, res) => {
    confirmarBajaSiniestroSchema.parse(req.body ?? {})
    await operaciones.reactivar(usuarioDeSesion(req), idSchema.parse(req.params.id))
    res.status(204).end()
  })
  router.delete('/:id', requerirRol('ADMINISTRADOR', 'SUPER_ADMINISTRADOR'), async (req, res) => {
    await operaciones.eliminar(
      usuarioDeSesion(req),
      idSchema.parse(req.params.id),
      confirmarSiniestroSchema.parse(req.body),
    )
    res.status(204).end()
  })
  router.get('/:id', async (req, res) => {
    res.json(await servicio.obtener(usuarioDeSesion(req), idSchema.parse(req.params.id)))
  })

  router.get('/:id/partes', async (req, res) => {
    res.json(await servicio.partes(usuarioDeSesion(req), idSchema.parse(req.params.id)))
  })

  return router
}
