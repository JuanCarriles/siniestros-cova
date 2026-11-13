import type { NotificacionBandeja } from '@cova/shared/schemas/bandeja-notificaciones'

/** El panel conserva lo que ya mostró hasta cerrarlo; una lectura remota no debe vaciarlo. */
export function combinarAvisosVisibles(
  actuales: NotificacionBandeja[],
  nuevos: NotificacionBandeja[],
) {
  const avisos = new Map(actuales.map((aviso) => [aviso.id, aviso]))
  for (const aviso of nuevos) avisos.set(aviso.id, aviso)
  return [...avisos.values()].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
}
