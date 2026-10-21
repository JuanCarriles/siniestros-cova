import { z } from 'zod'
import {
  catalogosUsuariosSchema,
  usuarioListadoSchema,
  type UsuarioFormularioData,
} from '@cova/shared/schemas/usuarios-abm'
import { api } from '@/lib/api'

export async function listarUsuarios() {
  return z.array(usuarioListadoSchema).parse(await api('/usuarios?incluirBajas=true'))
}
export async function catalogosUsuarios() {
  return catalogosUsuariosSchema.parse(await api('/usuarios/catalogos'))
}
export async function guardarUsuario(id: number | null, datos: UsuarioFormularioData) {
  return usuarioListadoSchema.parse(
    await api(id === null ? '/usuarios' : `/usuarios/${id}`, {
      method: id === null ? 'POST' : 'PATCH',
      body: datos,
    }),
  )
}
export function cambiarEstadoUsuario(id: number, tipo: 'baja' | 'reactivacion'): Promise<void> {
  return api(`/usuarios/${id}/${tipo}`, { method: 'PATCH' })
}
