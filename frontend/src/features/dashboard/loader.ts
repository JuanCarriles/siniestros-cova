import { data, type LoaderFunctionArgs } from 'react-router'
import { canOpenSection } from '@/components/layout/panel-navigation'
import { cargarPanel } from '@/features/auth/sesion'
import { obtenerDashboardGestor } from './api/dashboard.api'

export async function cargarDashboard(args: LoaderFunctionArgs) {
  const { usuario } = await cargarPanel(args)
  if (!canOpenSection(usuario.tipoUsuario, 'dashboard')) throw data(null, { status: 403 })
  return {
    dashboardGestor:
      usuario.tipoUsuario === 'GESTOR'
        ? await obtenerDashboardGestor(
            new URL(args.request.url).searchParams.get('paginaPericias'),
            args.request.signal,
          )
        : null,
  }
}
