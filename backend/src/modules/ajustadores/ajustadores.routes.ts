import { Router, type RequestHandler } from 'express'
import { ajustadorSchema, ajustadorUpdateSchema } from '@cova/shared/schemas/ajustadores'
import { consultaSiniestrosAsociadosSchema } from '@cova/shared/schemas/siniestros-asociados'
import { idSchema } from '@cova/shared/schemas/comunes'
import { requerirRol } from '../../middlewares/autenticar.ts'
import { HttpError } from '../../utils/httpError.ts'
import type { crearServicioAjustadores } from './ajustadores.service.ts'

// CU-03. Solo administradores y superadministradores (la sesión la valida requerirSesion).
// GET    /api/ajustadores?incluirBajas=true
// POST   /api/ajustadores
// PATCH  /api/ajustadores/:id
// PATCH  /api/ajustadores/:id/baja
// PATCH  /api/ajustadores/:id/reactivacion
export function crearAjustadoresRouter(deps: {
  servicio: ReturnType<typeof crearServicioAjustadores>
  requerirSesion: RequestHandler
}) {
  const { servicio, requerirSesion } = deps
  const router = Router()
  router.use(requerirSesion, requerirRol('ADMINISTRADOR', 'SUPER_ADMINISTRADOR'))

  const idDe = (params: { id?: string | string[] }) => idSchema.parse(params.id)

  router.get('/', async (req, res) => {
    const filtro = req.query.incluirBajas
    if (filtro !== undefined && filtro !== 'true' && filtro !== 'false') {
      throw new HttpError(400, 'El filtro incluirBajas debe ser true o false')
    }
    res.json(await servicio.listar(filtro === 'true'))
  })

  router.get('/:id/siniestros-activos', async (req, res) => {
    const { pagina } = consultaSiniestrosAsociadosSchema.parse(req.query)
    res.set('Cache-Control', 'no-store')
    res.json(await servicio.siniestrosActivos(idDe(req.params), pagina))
  })

  router.post('/', async (req, res) => {
    res.status(201).json(await servicio.crear(ajustadorSchema.parse(req.body)))
  })

  router.patch('/:id', async (req, res) => {
    res.json(await servicio.modificar(idDe(req.params), ajustadorUpdateSchema.parse(req.body)))
  })

  router.patch('/:id/baja', async (req, res) => {
    await servicio.darDeBaja(idDe(req.params))
    res.status(204).end()
  })

  router.patch('/:id/reactivacion', async (req, res) => {
    await servicio.reactivar(idDe(req.params))
    res.status(204).end()
  })

  return router
}
