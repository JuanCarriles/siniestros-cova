import { data, type LoaderFunctionArgs } from 'react-router'
import { requerirSeccion, sesionActual } from '@/features/auth/sesion'
import { listarSiniestros, opcionesAlta, opcionesSiniestros } from './api/siniestros.api'

// Primero controla sesión y rol; después trae la página pedida (filtros en la dirección) y las opciones de los
// filtros. La paginación, la búsqueda y el orden los resuelve el servidor.
export async function cargarSiniestros(args: LoaderFunctionArgs) {
  await requerirSeccion('siniestros')(args)
  const params = new URL(args.request.url).searchParams
  const [pagina, opciones] = await Promise.all([listarSiniestros(params), opcionesSiniestros()])
  return { pagina, opciones }
}

// Alta de siniestro (CU-09, E4-04): solo administrador y superadministrador. El id del usuario identifica su
// borrador en este navegador.
export async function cargarAltaSiniestro(args: LoaderFunctionArgs) {
  await requerirSeccion('siniestros')(args)
  const usuario = await sesionActual()
  if (!usuario || usuario.tipoUsuario === 'GESTOR')
    throw data('El alta de siniestros está a cargo de los administradores.', { status: 403 })
  return { idUsuario: usuario.id, opciones: await opcionesAlta() }
}
