import type { Request, RequestHandler } from 'express'
import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { TipoUsuario } from '@cova/shared/schemas/enums'
import { borrarCookieSesion, enviarCookieSesion, NOMBRE_COOKIE_SESION } from '../config/cookies.ts'
import type { ServicioSesiones } from '../modules/auth/sesiones.service.ts'
import { HttpError } from '../utils/httpError.ts'

export const MENSAJE_SIN_SESION = 'Tu sesión venció. Volvé a ingresar.'

export function tokenDeSesion(req: Request): string | undefined {
  const token: unknown = (req.cookies as Record<string, unknown> | undefined)?.[
    NOMBRE_COOKIE_SESION
  ]
  return typeof token === 'string' && token ? token : undefined
}

// Exige una sesión vigente y deja el usuario en req.usuario. Renueva el vencimiento (RNF-08: 7 h sin
// actividad) y reenvía la cookie con el nuevo maxAge.
export function crearRequerirSesion(sesiones: ServicioSesiones): RequestHandler {
  return async (req, res, next) => {
    const token = tokenDeSesion(req)
    const valida = token ? await sesiones.validar(token) : null
    if (!token || !valida) {
      if (token) borrarCookieSesion(res)
      throw new HttpError(401, MENSAJE_SIN_SESION)
    }
    if (valida.renovada) enviarCookieSesion(res, token, sesiones.duracionMs)
    req.usuario = valida.usuario
    next()
  }
}

/** Usuario de la sesión. Solo dentro de rutas protegidas con requerirSesion. */
export function usuarioDeSesion(req: Request): SesionUsuario {
  if (!req.usuario) throw new HttpError(401, MENSAJE_SIN_SESION)
  return req.usuario
}

// Va después de requerirSesion. Ocultar un menú en el frontend no protege nada: cada ruta de la API
// declara qué roles la pueden usar.
export function requerirRol(...roles: TipoUsuario[]): RequestHandler {
  return (req, _res, next) => {
    if (!roles.includes(usuarioDeSesion(req).tipoUsuario)) {
      throw new HttpError(403, 'Tu usuario no tiene permiso para esta acción.')
    }
    next()
  }
}
