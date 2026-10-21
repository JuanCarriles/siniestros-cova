import type { LoaderFunctionArgs } from 'react-router'
import { requerirSeccion } from '@/features/auth/sesion'
import { catalogosPerfil, obtenerPerfil } from './api/perfil.api'

export async function cargarPerfil(args: LoaderFunctionArgs) {
  await requerirSeccion('perfil')(args)
  const [perfil, catalogos] = await Promise.all([obtenerPerfil(), catalogosPerfil()])
  return { perfil, catalogos }
}
