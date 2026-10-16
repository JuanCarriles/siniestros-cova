import { Router, type RequestHandler } from 'express'
import { loginSchema } from '@cova/shared/schemas/auth'
import { borrarCookieSesion, enviarCookieSesion } from '../../config/cookies.ts'
import { tokenDeSesion, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import { DemasiadosIntentosError, type crearServicioAuth } from './auth.service.ts'
import type { ServicioSesiones } from './sesiones.service.ts'

// POST /api/auth/login   — CU-01: valida credenciales y crea la sesión (cookie httpOnly)
// POST /api/auth/logout  — cierra la sesión actual
// GET  /api/auth/sesion  — usuario de la sesión actual (401 si no hay o venció)
export function crearAuthRouter(deps: {
  auth: ReturnType<typeof crearServicioAuth>
  sesiones: ServicioSesiones
  requerirSesion: RequestHandler
}) {
  const { auth, sesiones, requerirSesion } = deps
  const router = Router()

  // Respuestas con datos de la sesión: que ningún navegador ni proxy las guarde
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  router.post('/login', async (req, res) => {
    const datos = loginSchema.parse(req.body)
    try {
      const { usuario, token } = await auth.login(datos, {
        ip: req.ip ?? 'desconocida',
        navegador: req.get('user-agent'),
      })
      enviarCookieSesion(res, token, sesiones.duracionMs)
      res.json({ usuario })
    } catch (err) {
      if (err instanceof DemasiadosIntentosError) res.set('Retry-After', String(err.esperaSegundos))
      throw err
    }
  })

  router.post('/logout', async (req, res) => {
    const token = tokenDeSesion(req)
    if (token) await sesiones.revocar(token)
    borrarCookieSesion(res)
    res.status(204).end()
  })

  router.get('/sesion', requerirSesion, (req, res) => {
    res.json({ usuario: usuarioDeSesion(req) })
  })

  return router
}
