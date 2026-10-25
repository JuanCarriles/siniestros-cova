import { Router, type RequestHandler } from 'express'
import { idSchema } from '@cova/shared/schemas/comunes'
import { confirmarSiniestroSchema, filtrosSiniestrosSchema } from '@cova/shared/schemas/siniestros'
import { requerirRol, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import type { crearServicioBajasSiniestros } from './siniestros-bajas.service.ts'
import type { crearServicioSiniestros } from './siniestros.service.ts'

// CU-09. Todos los roles; el servicio limita al gestor a sus siniestros (RF-17).
// GET /api/siniestros?pagina=&porPagina=&q=&estado=&aseguradora=&gestor=&bajas=&orden=
// GET /api/siniestros/opciones
// GET /api/siniestros/:id
// GET /api/siniestros/:id/partes
export function crearSiniestrosRouter(deps: {
  operaciones: ReturnType<typeof crearServicioBajasSiniestros>
  servicio: ReturnType<typeof crearServicioSiniestros>
  requerirSesion: RequestHandler
}) {
  const { servicio, operaciones, requerirSesion } = deps
  const router = Router()
  router.use(requerirSesion, requerirRol('GESTOR', 'ADMINISTRADOR', 'SUPER_ADMINISTRADOR'))

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
      await operaciones.darDeBaja(
        usuarioDeSesion(req),
        idSchema.parse(req.params.id),
        confirmarSiniestroSchema.parse(req.body),
      )
      res.status(204).end()
    },
  )
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
