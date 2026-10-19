import { Router, type RequestHandler } from 'express'
import { aseguradoraSchema, aseguradoraUpdateSchema } from '@cova/shared/schemas/aseguradoras'
import { idSchema } from '@cova/shared/schemas/comunes'
import { requerirRol } from '../../middlewares/autenticar.ts'
import { HttpError } from '../../utils/httpError.ts'
import type { crearServicioAseguradoras } from './aseguradoras.service.ts'

// CU-02. Solo administradores y superadministradores (la sesión la valida requerirSesion).
// GET    /api/aseguradoras?incluirBajas=true
// POST   /api/aseguradoras
// PATCH  /api/aseguradoras/:id
// PATCH  /api/aseguradoras/:id/baja
// PATCH  /api/aseguradoras/:id/reactivacion
export function crearAseguradorasRouter(deps: {
  servicio: ReturnType<typeof crearServicioAseguradoras>
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

  router.get('/:id/ajustadores', async (req, res) => {
    res.json(await servicio.listarAjustadores(idDe(req.params)))
  })

  router.post('/', async (req, res) => {
    res.status(201).json(await servicio.crear(aseguradoraSchema.parse(req.body)))
  })

  router.patch('/:id', async (req, res) => {
    res.json(await servicio.modificar(idDe(req.params), aseguradoraUpdateSchema.parse(req.body)))
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
