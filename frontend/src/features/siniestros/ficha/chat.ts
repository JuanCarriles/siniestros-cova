import type { MensajeChat } from '@cova/shared/schemas/chat'

// Chat del siniestro (E7-02): reglas de la conversación sin React, para probarlas aparte.

/** Del más viejo al más nuevo, sin repetidos (un mensaje puede llegar por la respuesta y por el socket) */
export function unirMensajes(actuales: MensajeChat[], nuevos: MensajeChat[]): MensajeChat[] {
  if (!nuevos.length) return actuales
  const porId = new Map(actuales.map((m) => [m.id, m]))
  let cambio = false
  for (const m of nuevos)
    if (!porId.has(m.id)) {
      porId.set(m.id, m)
      cambio = true
    }
  if (!cambio) return actuales
  return [...porId.values()].sort((a, b) => a.fechaEnvio.localeCompare(b.fechaEnvio) || a.id - b.id)
}
