import { data, redirect, type LoaderFunctionArgs } from 'react-router'
import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { TipoUsuario } from '@cova/shared/schemas/enums'
import {
  canOpenSection,
  initialSection,
  type PanelSection,
} from '@/components/layout/panel-navigation'
import { cerrarSesion, obtenerSesion } from './api/auth.api'

// Loaders y actions de React Router para la sesión. Protegen la interfaz; quien protege los datos es el
// backend, que valida sesión y rol en cada pedido.

// Al navegar corren a la vez el loader del panel y el de la sección: comparten un único pedido a la API.
let consultaEnCurso: Promise<SesionUsuario | null> | null = null
export function sesionActual(): Promise<SesionUsuario | null> {
  consultaEnCurso ??= obtenerSesion().finally(() => {
    consultaEnCurso = null
  })
  return consultaEnCurso
}

/** Página a la que entra cada rol: gestor → siniestros; administradores → dashboard. */
export function rutaInicio(tipo: TipoUsuario): string {
  return `/${initialSection(tipo) ?? 'perfil'}`
}

/** Solo rutas internas: un ?volver=https://otro-sitio no puede usarse para mandar a alguien afuera. */
export function rutaVolverSegura(volver: string | null): string | null {
  if (!volver?.startsWith('/') || volver.startsWith('//') || volver.startsWith('/\\')) return null
  if (volver.startsWith('/login')) return null
  return volver
}

function aLogin(request: Request): never {
  const { pathname, search } = new URL(request.url)
  const volver = pathname === '/' ? '' : `?volver=${encodeURIComponent(pathname + search)}`
  throw redirect(`/login${volver}`)
}

/** Panel principal: exige sesión y devuelve el usuario. */
export async function cargarPanel({ request }: LoaderFunctionArgs) {
  const usuario = await sesionActual()
  if (!usuario) aLogin(request)
  return { usuario }
}

/** "/" lleva a la página de inicio del rol. */
export async function irAInicio({ request }: LoaderFunctionArgs) {
  const usuario = await sesionActual()
  if (!usuario) aLogin(request)
  throw redirect(rutaInicio(usuario.tipoUsuario))
}

/** Cada sección del panel controla el rol antes de mostrarse. */
export function requerirSeccion(seccion: PanelSection) {
  return async ({ request }: LoaderFunctionArgs) => {
    const usuario = await sesionActual()
    if (!usuario) aLogin(request)
    if (!canOpenSection(usuario.tipoUsuario, seccion)) throw data(null, { status: 403 })
    return null
  }
}

/** /login con una sesión vigente lleva directo al inicio. */
export async function redirigirSiHaySesion() {
  // Si el servidor no responde, igual se muestra el login: al enviar se informa el problema
  const usuario = await sesionActual().catch(() => null)
  if (usuario) throw redirect(rutaInicio(usuario.tipoUsuario))
  return null
}

/** Action de /salir (botón "Cerrar sesión"). */
export async function salir() {
  // Aunque falle el pedido (sin conexión) se vuelve al login; esa sesión vence a las 7 h sin uso
  await cerrarSesion().catch(() => undefined)
  return redirect('/login?motivo=salida')
}
