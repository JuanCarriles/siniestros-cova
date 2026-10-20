import type { LoaderFunctionArgs } from 'react-router'
import { requerirSeccion } from '@/features/auth/sesion'
import { listarAseguradoras } from '@/features/aseguradoras/api/aseguradoras.api'
import { listarAjustadores } from './api/ajustadores.api'

// Primero controla sesión y rol; después trae los ajustadores y las aseguradoras (para el filtro y el formulario)
export async function cargarAjustadores(args: LoaderFunctionArgs) {
  await requerirSeccion('ajustadores')(args)
  const [ajustadores, aseguradoras] = await Promise.all([listarAjustadores(), listarAseguradoras()])
  return { ajustadores, aseguradoras }
}
