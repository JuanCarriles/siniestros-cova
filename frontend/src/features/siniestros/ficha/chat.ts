import type { LecturaChat, LecturasNuevasChat, MensajeChat } from '@cova/shared/schemas/chat'

// Chat del siniestro (E7-02): reglas de la conversación sin React, para probarlas aparte.

/**
 * E7-03: junta las lecturas de dos copias del mismo mensaje, una por lector, de la primera a la última. Cada copia
 * puede traer lectores que la otra no tiene (una llegó por el socket, la otra al recargar después de un corte): no
 * alcanza con quedarse con la que tiene más. Si un lector aparece en las dos, vale la lectura más temprana (la que
 * quedó guardada primero). Devuelve la misma lista si no hay nada nuevo.
 */
export function unirLecturas(actuales: LecturaChat[], nuevas: LecturaChat[]): LecturaChat[] {
  const porLector = new Map(actuales.map((l) => [l.lector.id, l]))
  let cambio = false
  for (const l of nuevas) {
    const conocida = porLector.get(l.lector.id)
    if (!conocida || l.fechaLeido < conocida.fechaLeido) {
      porLector.set(l.lector.id, l)
      cambio = true
    }
  }
  if (!cambio) return actuales
  return [...porLector.values()].sort(
    (a, b) => a.fechaLeido.localeCompare(b.fechaLeido) || a.lector.id - b.lector.id,
  )
}

/**
 * Del más viejo al más nuevo, sin repetidos (un mensaje puede llegar por la respuesta, por el socket y al recargar la
 * conversación). Si llega otra vez, se suman las lecturas que no se conocían (E7-03).
 */
export function unirMensajes(actuales: MensajeChat[], nuevos: MensajeChat[]): MensajeChat[] {
  if (!nuevos.length) return actuales
  const porId = new Map(actuales.map((m) => [m.id, m]))
  let cambio = false
  for (const m of nuevos) {
    const actual = porId.get(m.id)
    if (!actual) {
      porId.set(m.id, m)
      cambio = true
      continue
    }
    const leidoPor = unirLecturas(actual.leidoPor, m.leidoPor)
    if (leidoPor !== actual.leidoPor) {
      porId.set(m.id, { ...actual, leidoPor })
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
    if (!ids.has(m.id) || m.autor.id === l.lector.id) return m
    const leidoPor = unirLecturas(m.leidoPor, [{ lector: l.lector, fechaLeido: l.fechaLeido }])
    if (leidoPor === m.leidoPor) return m
    cambio = true
    return { ...m, leidoPor }
  })
  return cambio ? resultado : mensajes
}

/**
 * E7-03: los mensajes de otros que este usuario todavía no leyó, como texto ("12,15"; vacío si no hay). Sirve de
 * dependencia de un efecto: cambia cada vez que cambia el conjunto, no solo cuando pasa de "hay" a "no hay".
 */
export function idsPorLeer(mensajes: MensajeChat[], idUsuario: number) {
  return mensajes
    .filter((m) => m.autor.id !== idUsuario && !m.leidoPor.some((l) => l.lector.id === idUsuario))
    .map((m) => m.id)
    .join(',')
}

/** E7-03: hay mensajes de otros que este usuario todavía no leyó */
export function hayPorLeer(mensajes: MensajeChat[], idUsuario: number) {
  return idsPorLeer(mensajes, idUsuario) !== ''
}
