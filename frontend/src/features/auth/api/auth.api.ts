import type { LoginData, SesionUsuario } from '@cova/shared/schemas/auth'
import { api, ApiError } from '@/lib/api'

export async function iniciarSesion(datos: LoginData): Promise<SesionUsuario> {
  const { usuario } = await api<{ usuario: SesionUsuario }>('/auth/login', {
    method: 'POST',
    body: datos,
    sesion: 'opcional',
  })
  return usuario
}

export async function cerrarSesion(): Promise<void> {
  await api('/auth/logout', { method: 'POST', sesion: 'opcional' })
}

/** Usuario de la sesión actual, o null si no hay sesión o venció. */
export async function obtenerSesion(): Promise<SesionUsuario | null> {
  try {
    const { usuario } = await api<{ usuario: SesionUsuario }>('/auth/sesion', {
      sesion: 'opcional',
    })
    return usuario
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null
    throw err
  }
}

export type RecuperacionSolicitada = {
  mensaje: string
  reenvioSegundos: number
  vigenciaSegundos: number
}
export function solicitarRecuperacion(datos: { email: string }): Promise<RecuperacionSolicitada> {
  return api('/auth/recuperacion/solicitar', { method: 'POST', body: datos, sesion: 'opcional' })
}
export function verificarCodigo(datos: { codigo: string }): Promise<void> {
  return api('/auth/recuperacion/verificar', { method: 'POST', body: datos, sesion: 'opcional' })
}
export function cambiarContrasenaRecuperada(datos: {
  contrasena: string
  confirmarContrasena: string
}): Promise<void> {
  return api('/auth/recuperacion/cambiar', { method: 'POST', body: datos, sesion: 'opcional' })
}
