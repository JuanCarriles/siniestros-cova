import type { LoaderFunctionArgs } from 'react-router'
import { requerirSeccion } from '@/features/auth/sesion'
import { listarSiniestros, opcionesSiniestros } from './api/siniestros.api'

// Primero controla sesión y rol; después trae la página pedida (filtros en la dirección) y las opciones de los
// filtros. La paginación, la búsqueda y el orden los resuelve el servidor.
export async function cargarSiniestros(args: LoaderFunctionArgs) {
  await requerirSeccion('siniestros')(args)
  const params = new URL(args.request.url).searchParams
  const [pagina, opciones] = await Promise.all([listarSiniestros(params), opcionesSiniestros()])
  return { pagina, opciones }
}
