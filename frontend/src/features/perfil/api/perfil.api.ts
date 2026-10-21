import {
  perfilSchema,
  type PerfilActualizacionData,
  type PerfilContrasenaData,
  type PerfilVerificarData,
} from '@cova/shared/schemas/perfil'
import { catalogosUsuariosSchema } from '@cova/shared/schemas/usuarios-abm'
import { api } from '@/lib/api'

export async function obtenerPerfil() {
  return perfilSchema.parse(await api('/perfil'))
}
export async function catalogosPerfil() {
  return catalogosUsuariosSchema.parse(await api('/perfil/catalogos'))
}
export function verificarPerfil(datos: PerfilVerificarData): Promise<void> {
  return api('/perfil/verificar', { method: 'POST', body: datos })
}
export function guardarPerfil(datos: PerfilActualizacionData): Promise<void> {
  return api('/perfil', { method: 'PATCH', body: datos })
}
export function cambiarContrasenaPerfil(datos: PerfilContrasenaData): Promise<void> {
  return api('/perfil/contrasena', { method: 'PATCH', body: datos })
}
