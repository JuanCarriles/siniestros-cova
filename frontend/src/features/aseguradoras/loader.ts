import { idSchema } from '@cova/shared/schemas/comunes'
import type { LoaderFunctionArgs } from 'react-router'
import { requerirSeccion } from '@/features/auth/sesion'
import { listarAseguradoras, listarAjustadoresAseguradora } from './api/aseguradoras.api'

// Primero controla sesión y rol (como toda sección del panel); después trae el listado
export async function cargarAseguradoras(args: LoaderFunctionArgs) {
  await requerirSeccion('aseguradoras')(args)
  return { aseguradoras: await listarAseguradoras() }
}

export async function cargarAjustadoresAseguradora(args: LoaderFunctionArgs) {
  await requerirSeccion('aseguradoras')(args)
  return listarAjustadoresAseguradora(idSchema.parse(args.params.idAseguradora))
}
