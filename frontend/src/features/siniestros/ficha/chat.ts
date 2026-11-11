import type { LecturasNuevasChat, MensajeChat } from '@cova/shared/schemas/chat'

// Chat del siniestro (E7-02): reglas de la conversación sin React, para probarlas aparte.

/**
 * Del más viejo al más nuevo, sin repetidos (un mensaje puede llegar por la respuesta, por el socket y al recargar la
 * conversación). Si llega otra vez con más lecturas (E7-03: se recargó después de un corte), queda la más completa.
 */
export function unirMensajes(actuales: MensajeChat[], nuevos: MensajeChat[]): MensajeChat[] {
  if (!nuevos.length) return actuales
  const porId = new Map(actuales.map((m) => [m.id, m]))
  let cambio = false
  for (const m of nuevos) {
    const actual = porId.get(m.id)
    if (!actual || m.leidoPor.length > actual.leidoPor.length) {
      porId.set(m.id, m)
      cambio = true
    }
  }
  if (!cambio) return actuales
  return [...porId.values()].sort((a, b) => a.fechaEnvio.localeCompare(b.fechaEnvio) || a.id - b.id)
}

/** E7-03: suma una lectura a los mensajes leídos (una sola vez por lector y mensaje; el autor no cuenta) */
export function aplicarLecturas(mensajes: MensajeChat[], l: LecturasNuevasChat): MensajeChat[] {
  const ids = new Set(l.idsMensajes)
  let cambio = false
  const resultado = mensajes.map((m) => {
    if (
      !ids.has(m.id) ||
      m.autor.id === l.lector.id ||
      m.leidoPor.some((x) => x.lector.id === l.lector.id)
    )
      return m
    cambio = true
    return { ...m, leidoPor: [...m.leidoPor, { lector: l.lector, fechaLeido: l.fechaLeido }] }
  })
  return cambio ? resultado : mensajes
}

/** E7-03: hay mensajes de otros que este usuario todavía no leyó */
export function hayPorLeer(mensajes: MensajeChat[], idUsuario: number) {
  return mensajes.some(
    (m) => m.autor.id !== idUsuario && !m.leidoPor.some((l) => l.lector.id === idUsuario),
  )
}
