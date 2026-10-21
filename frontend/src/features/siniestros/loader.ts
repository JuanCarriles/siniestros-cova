import { data, type LoaderFunctionArgs } from 'react-router'
import { idSchema } from '@cova/shared/schemas/comunes'
import { requerirSeccion } from '@/features/auth/sesion'
import { ApiError } from '@/lib/api'
import { listarSiniestros, obtenerSiniestro, opcionesSiniestros } from './api/siniestros.api'

// Primero controla sesión y rol; después trae la página pedida (filtros en la dirección) y las opciones de los
// filtros. La paginación, la búsqueda y el orden los resuelve el servidor.
export async function cargarSiniestros(args: LoaderFunctionArgs) {
  await requerirSeccion('siniestros')(args)
  const params = new URL(args.request.url).searchParams
  const [pagina, opciones] = await Promise.all([listarSiniestros(params), opcionesSiniestros()])
  return { pagina, opciones }
}

// Ficha de un siniestro. El servidor decide el acceso (E4-03): un gestor que abre uno que no es suyo recibe 403 y
// ve la pantalla de "no disponible" con el motivo, dentro del panel.
export async function cargarFichaSiniestro(args: LoaderFunctionArgs) {
  await requerirSeccion('siniestros')(args)
  const id = idSchema.safeParse(args.params.idSiniestro)
  if (!id.success) throw data('El siniestro no existe.', { status: 404 })
  try {
    return { siniestro: await obtenerSiniestro(id.data) }
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      throw data(err.message, { status: err.status })
    }
    throw err
  }
}
