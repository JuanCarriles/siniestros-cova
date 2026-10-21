import type { LoaderFunctionArgs } from 'react-router'
import { requerirSeccion, sesionActual } from '@/features/auth/sesion'
import { catalogosUsuarios, listarUsuarios } from './api/usuarios.api'

export async function cargarUsuarios(args: LoaderFunctionArgs) {
  await requerirSeccion('usuarios')(args)
  const [usuarios, catalogos, actor] = await Promise.all([
    listarUsuarios(),
    catalogosUsuarios(),
    sesionActual(),
  ])
  if (!actor) throw new Error('La sesión venció. Volvé a ingresar.')
  return { usuarios, catalogos, actor }
}
