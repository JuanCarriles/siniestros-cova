import {
  perfilSchema,
  type PerfilDatosData,
  type PerfilVerificarData,
} from '@cova/shared/schemas/perfil'
import { catalogosUsuariosSchema } from '@cova/shared/schemas/usuarios-abm'
import type { NuevaContrasenaData } from '@cova/shared/schemas/auth'
import { api } from '@/lib/api'

export async function obtenerPerfil() {
  return perfilSchema.parse(await api('/perfil'))
}
export async function catalogosPerfil() {
  return catalogosUsuariosSchema.parse(await api('/perfil/catalogos'))
}
export function verificarPerfil(datos: PerfilVerificarData): Promise<{ vigenciaSegundos: number }> {
  return api('/perfil/verificar', { method: 'POST', body: datos })
}
export function bloquearPerfil(): Promise<void> {
  return api('/perfil/bloquear', { method: 'POST' })
}
export function guardarPerfil(datos: PerfilDatosData): Promise<void> {
  return api('/perfil', { method: 'PATCH', body: datos })
}
export function cambiarContrasenaPerfil(datos: NuevaContrasenaData): Promise<void> {
  return api('/perfil/contrasena', { method: 'PATCH', body: datos })
}
