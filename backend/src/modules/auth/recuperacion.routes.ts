import { Router } from 'express'
import {
  solicitarRecuperacionSchema,
  verificarCodigoSchema,
  nuevaContrasenaSchema,
} from '@cova/shared/schemas/auth'
import { borrarCookieSesion, cookieSesion } from '../../config/cookies.ts'
import { HttpError } from '../../utils/httpError.ts'
import {
  MENSAJE_RECUPERACION,
  REENVIO_SEGUNDOS,
  type crearServicioRecuperacion,
} from './recuperacion.service.ts'

const COOKIE = 'cova_recuperacion'
const opciones = { ...cookieSesion, path: '/api/auth/recuperacion' }
export function crearRecuperacionRouter(servicio: ReturnType<typeof crearServicioRecuperacion>) {
  const router = Router()
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (!req.is('application/json')) throw new HttpError(415, 'Enviá los datos como JSON.')
    next()
  })
  const token = (cookies: unknown) => {
    const value: unknown = (cookies as Record<string, unknown> | undefined)?.[COOKIE]
    return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : ''
  }
  router.post('/solicitar', async (req, res) => {
    const { email } = solicitarRecuperacionSchema.parse(req.body)
    const inicio = Date.now()
    const desafio = await servicio.solicitar(email, req.ip ?? 'desconocida', token(req.cookies))
    if (desafio) res.cookie(COOKIE, desafio, { ...opciones, maxAge: servicio.duracionMs })
    // Piso de respuesta común para el lookup de cuentas activas, ausentes y dadas de baja.
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 300 - (Date.now() - inicio))))
    res.status(202).json({
      mensaje: MENSAJE_RECUPERACION,
      reenvioSegundos: REENVIO_SEGUNDOS,
      vigenciaSegundos: servicio.duracionMs / 1000,
    })
  })
  router.post('/verificar', async (req, res) => {
    const { codigo } = verificarCodigoSchema.parse(req.body)
    const autorizado = await servicio.verificar(token(req.cookies), codigo, req.ip ?? 'desconocida')
    res.cookie(COOKIE, autorizado, { ...opciones, maxAge: servicio.duracionMs })
    res.status(204).end()
  })
  router.post('/cambiar', async (req, res) => {
    const { contrasena } = nuevaContrasenaSchema.parse(req.body)
    await servicio.cambiar(token(req.cookies), contrasena, req.ip ?? 'desconocida')
    res.clearCookie(COOKIE, opciones)
    borrarCookieSesion(res)
    res.status(204).end()
  })
  return router
}
