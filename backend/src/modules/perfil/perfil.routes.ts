import { Router, type Request, type RequestHandler } from 'express'
import {
  perfilContrasenaSchema,
  perfilDatosSchema,
  perfilVerificarSchema,
} from '@cova/shared/schemas/perfil'
import { tokenDeSesion, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import { HttpError } from '../../utils/httpError.ts'
import type { crearServicioPerfil } from './perfil.service.ts'

export function crearPerfilRouter({
  servicio,
  requerirSesion,
}: {
  servicio: ReturnType<typeof crearServicioPerfil>
  requerirSesion: RequestHandler
}) {
  const router = Router()
  router.use(requerirSesion, (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  function contexto(req: Request) {
    const token = tokenDeSesion(req)
    if (!token) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
    return { id: usuarioDeSesion(req).id, token }
  }
  // No hay /:id: la identidad siempre viene de la sesión autenticada, para todos los roles.
  router.get('/', async (req, res) => {
    res.json(await servicio.obtener(usuarioDeSesion(req).id))
  })
  router.get('/catalogos', async (_req, res) => {
    res.json(await servicio.catalogos())
  })
  router.post('/verificar', async (req, res) => {
    const { id, token } = contexto(req)
    res.json(await servicio.verificar(id, token, perfilVerificarSchema.parse(req.body), req.ip))
  })
  router.post('/bloquear', (req, res) => {
    servicio.bloquear(contexto(req).token)
    res.status(204).end()
  })
  router.patch('/', async (req, res) => {
    const { id, token } = contexto(req)
    await servicio.modificar(id, token, perfilDatosSchema.parse(req.body))
    res.status(204).end()
  })
  router.patch('/contrasena', async (req, res) => {
    const { id, token } = contexto(req)
    const datos = perfilContrasenaSchema.parse(req.body)
    await servicio.cambiarContrasena(id, token, datos.contrasena)
    res.status(204).end()
  })
  return router
}
