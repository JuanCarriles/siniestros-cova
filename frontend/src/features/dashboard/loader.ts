import { data, type LoaderFunctionArgs } from 'react-router'
import { canOpenSection } from '@/components/layout/panel-navigation'
import { cargarPanel } from '@/features/auth/sesion'
import { consultaDashboardAdministradorSchema } from '@cova/shared/schemas/dashboard'
import { obtenerDashboardAdministrador, obtenerDashboardGestor } from './api/dashboard.api'

export async function cargarDashboard(args: LoaderFunctionArgs) {
  const { usuario } = await cargarPanel(args)
  if (!canOpenSection(usuario.tipoUsuario, 'dashboard')) throw data(null, { status: 403 })
  const params = new URL(args.request.url).searchParams
  const consultaAdmin = consultaDashboardAdministradorSchema.safeParse(Object.fromEntries(params))
  if (usuario.tipoUsuario !== 'GESTOR' && !consultaAdmin.success)
    throw data('La dirección del dashboard no es válida.', { status: 400 })
  return {
    dashboardAdministrador:
      usuario.tipoUsuario !== 'GESTOR'
        ? await obtenerDashboardAdministrador(new URL(args.request.url).search, args.request.signal)
        : null,
    ver:
      usuario.tipoUsuario !== 'GESTOR' && consultaAdmin.success
        ? consultaAdmin.data.ver
        : undefined,
    dashboardGestor:
      usuario.tipoUsuario === 'GESTOR'
        ? await obtenerDashboardGestor(
            new URL(args.request.url).searchParams.get('paginaPericias'),
            args.request.signal,
          )
        : null,
  }
}
