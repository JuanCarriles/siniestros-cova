import { Router, type RequestHandler } from 'express'
import {
  usuarioAltaSchema,
  usuarioModificacionSchema,
  tiposUsuarioAdministrables,
} from '@cova/shared/schemas/usuarios-abm'
import { idSchema } from '@cova/shared/schemas/comunes'
import { usuarioDeSesion } from '../../middlewares/autenticar.ts'
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
  router.use(requerirSesion, (req, _res, next) => {
    if (tiposUsuarioAdministrables(usuarioDeSesion(req).tipoUsuario).length === 0)
      throw new HttpError(403, 'Los gestores no pueden crear ni administrar usuarios.')
    next()
  })
  router.get('/', async (req, res) => {
    const filtro = req.query.incluirBajas
    if (filtro !== undefined && filtro !== 'true' && filtro !== 'false')
      throw new HttpError(400, 'El filtro incluirBajas debe ser true o false.')
    res.json(await servicio.listar(filtro === 'true'))
  })
  router.get('/catalogos', async (_req, res) => {
    res.json(await servicio.catalogos())
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
