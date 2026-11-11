import {
  bandejaNotificacionesSchema,
  type LecturasNotificaciones,
} from '@cova/shared/schemas/bandeja-notificaciones'
import { api } from '@/lib/api'

export async function consultarNotificaciones(query: string, signal: AbortSignal) {
  return bandejaNotificacionesSchema.parse(
    await api(`/notificaciones${query ? `?${query}` : ''}`, { signal }),
  )
}
export const leerNotificaciones = (body: LecturasNotificaciones, signal?: AbortSignal) =>
  api('/notificaciones/lecturas', { method: 'PATCH', body, signal })
export const marcarLectura = (id: number, leida: boolean) =>
  api(`/notificaciones/${id}/lectura`, { method: 'PATCH', body: { leida } })
export const marcarRevision = (id: number, revisada: boolean) =>
  api(`/notificaciones/${id}/revision`, { method: 'PATCH', body: { revisada } })
