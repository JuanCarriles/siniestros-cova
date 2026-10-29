import { dashboardAdministradorSchema, dashboardGestorSchema } from '@cova/shared/schemas/dashboard'
import { api } from '@/lib/api'

export async function obtenerDashboardGestor(paginaPericias: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams()
  if (paginaPericias !== null) query.set('paginaPericias', paginaPericias)
  return dashboardGestorSchema.parse(await api<unknown>(`/dashboard/gestor?${query}`, { signal }))
}
export async function obtenerDashboardAdministrador(query: string, signal?: AbortSignal) {
  return dashboardAdministradorSchema.parse(
    await api<unknown>(`/dashboard/administrador${query}`, { signal }),
  )
}
