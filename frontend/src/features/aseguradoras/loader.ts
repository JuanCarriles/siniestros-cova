import type { LoaderFunctionArgs } from 'react-router'
import { requerirSeccion } from '@/features/auth/sesion'
import { listarAseguradoras } from './api/aseguradoras.api'

// Primero controla sesión y rol (como toda sección del panel); después trae el listado
export async function cargarAseguradoras(args: LoaderFunctionArgs) {
  await requerirSeccion('aseguradoras')(args)
  return { aseguradoras: await listarAseguradoras() }
}
