import { Router, type RequestHandler } from 'express'
import { usuarioAltaSchema, usuarioModificacionSchema } from '@cova/shared/schemas/usuarios-abm'
import { consultaSiniestrosAsociadosSchema } from '@cova/shared/schemas/siniestros-asociados'
import { idSchema } from '@cova/shared/schemas/comunes'
import { requerirRol, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import { HttpError } from '../../utils/httpError.ts'
import type { crearServicioUsuarios } from './usuarios.service.ts'

export function crearUsuariosRouter({
  servicio,
  requerirSesion,
}: {
  servicio: ReturnType<typeof crearServicioUsuarios>
  requerirSesion: RequestHandler
}) {
  const router = Router()
  router.use(requerirSesion, requerirRol('ADMINISTRADOR', 'SUPER_ADMINISTRADOR'))
  router.get('/', async (req, res) => {
    const filtro = req.query.incluirBajas
    if (filtro !== undefined && filtro !== 'true' && filtro !== 'false')
      throw new HttpError(400, 'El filtro incluirBajas debe ser true o false.')
    res.json(await servicio.listar(filtro === 'true'))
  })
  router.get('/catalogos', async (_req, res) => {
    res.json(await servicio.catalogos())
  })
  router.get('/:id/siniestros-activos', async (req, res) => {
    const { pagina } = consultaSiniestrosAsociadosSchema.parse(req.query)
    res.set('Cache-Control', 'no-store')
    res.json(
      await servicio.siniestrosActivos(usuarioDeSesion(req), idSchema.parse(req.params.id), pagina),
    )
  })

  router.post('/', async (req, res) => {
    res
      .status(201)
      .json(await servicio.crear(usuarioDeSesion(req), usuarioAltaSchema.parse(req.body)))
  })
  router.patch('/:id', async (req, res) => {
    res.json(
      await servicio.modificar(
        usuarioDeSesion(req),
        idSchema.parse(req.params.id),
        usuarioModificacionSchema.parse(req.body),
      ),
    )
  })
  router.patch('/:id/baja', async (req, res) => {
    await servicio.darDeBaja(usuarioDeSesion(req), idSchema.parse(req.params.id))
    res.status(204).end()
  })
  router.patch('/:id/reactivacion', async (req, res) => {
    await servicio.reactivar(usuarioDeSesion(req), idSchema.parse(req.params.id))
    res.status(204).end()
  })
  return router
}
