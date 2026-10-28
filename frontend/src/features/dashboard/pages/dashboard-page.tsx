import { useLoaderData } from 'react-router'
import type { cargarDashboard } from '../loader'
import { DashboardGestorPage } from './dashboard-gestor-page'
import { DashboardAdministradorPage } from './dashboard-administrador-page'

export function DashboardPage() {
  const { dashboardGestor, dashboardAdministrador, ver } = useLoaderData<typeof cargarDashboard>()
  if (dashboardGestor) return <DashboardGestorPage dashboard={dashboardGestor} />
  if (dashboardAdministrador)
    return <DashboardAdministradorPage dashboard={dashboardAdministrador} ver={ver} />
  return null
}
