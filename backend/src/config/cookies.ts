import type { CookieOptions, Response } from 'express'
import { env } from './env.ts'

export const NOMBRE_COOKIE_SESION = 'cova_sesion'

// Opciones base de la cookie de sesión, para el módulo de autenticación.
// - httpOnly: el JavaScript del navegador no puede leerla (protege ante XSS).
// - secure: solo viaja por HTTPS; se controla con COOKIE_SECURE (ver config/env.ts).
// - sameSite lax: no se envía en pedidos iniciados desde otros sitios (protege ante CSRF).
export const cookieSesion: CookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax',
  path: '/',
}

export function enviarCookieSesion(res: Response, token: string, duracionMs: number) {
  res.cookie(NOMBRE_COOKIE_SESION, token, { ...cookieSesion, maxAge: duracionMs })
}

export function borrarCookieSesion(res: Response) {
  res.clearCookie(NOMBRE_COOKIE_SESION, cookieSesion)
}
