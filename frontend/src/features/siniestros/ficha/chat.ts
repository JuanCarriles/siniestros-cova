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

/** Lo mínimo de un envío propio sin confirmar para ubicarlo en la conversación */
type Anclado = { despuesDe: number | null }

export type ElementoConversacion<P extends Anclado> =
  { tipo: 'mensaje'; mensaje: MensajeChat } | { tipo: 'pendiente'; pendiente: P }

/**
 * La conversación tal como se muestra: los mensajes confirmados y, entre ellos, los envíos propios que todavía no
 * se confirmaron. Cada pendiente va justo después del mensaje que era el último cuando se escribió (`despuesDe`),
 * así lo que llega después (por ejemplo, de otros mientras no había conexión) aparece debajo y a la vista, en
 * lugar de quedar tapado. No depende del reloj del equipo. Si se escribió con la conversación vacía, va primero;
 * si su mensaje de referencia no está, al final.
 */
export function lineaDeTiempo<P extends Anclado>(
  mensajes: MensajeChat[],
  pendientes: P[],
): ElementoConversacion<P>[] {
  const ids = new Set(mensajes.map((m) => m.id))
  const anclados = new Map<number | null, P[]>()
  const sueltos: P[] = []
  for (const p of pendientes) {
    if (p.despuesDe !== null && !ids.has(p.despuesDe)) {
      sueltos.push(p)
      continue
    }
    anclados.set(p.despuesDe, [...(anclados.get(p.despuesDe) ?? []), p])
  }
  const pendiente = (p: P): ElementoConversacion<P> => ({ tipo: 'pendiente', pendiente: p })
  const resultado: ElementoConversacion<P>[] = (anclados.get(null) ?? []).map(pendiente)
  for (const m of mensajes) {
    resultado.push({ tipo: 'mensaje', mensaje: m })
    for (const p of anclados.get(m.id) ?? []) resultado.push(pendiente(p))
  }
  return [...resultado, ...sueltos.map(pendiente)]
}

/**
 * Si un envío que falló se puede reenviar solo al volver la conexión: sin respuesta del servidor (status 0 o
 * ausente), demora o un error del servidor (5xx). Un rechazo (por ejemplo, el caso se cerró: 409; sin permiso:
 * 403) no se reenvía solo: se muestra el motivo y la persona decide.
 */
export function esFallaDeConexion(status: number | undefined) {
  return status === undefined || status === 0 || status === 408 || status === 429 || status >= 500
}

/** Cuántos colores hay para los participantes (tokens --color-persona-1 … 6) */
export const COLORES_PARTICIPANTES = 6

/**
 * Un color por participante de la conversación (sin contar al usuario, que tiene el suyo), para distinguir quién
 * escribió cada mensaje sin leer el nombre. Devuelve el índice (0 a COLORES_PARTICIPANTES - 1) de cada autor.
 *
 * - En una misma conversación no se repiten mientras haya hasta COLORES_PARTICIPANTES personas.
 * - Cada persona arranca del color que le toca por su id, así suele tener el mismo color en todos los siniestros;
 *   si ya lo tiene otro de esta conversación, toma el siguiente libre. Se asignan en el orden en que aparecen en la
 *   conversación, para que un mensaje nuevo no le cambie el color a nadie.
 */
export function coloresParticipantes(mensajes: MensajeChat[], idUsuario: number) {
  const colores = new Map<number, number>()
  const usados = new Set<number>()
  for (const m of mensajes) {
    const id = m.autor.id
    if (id === idUsuario || colores.has(id)) continue
    let color = Math.abs(id) % COLORES_PARTICIPANTES
    if (usados.size < COLORES_PARTICIPANTES)
      while (usados.has(color)) color = (color + 1) % COLORES_PARTICIPANTES
    colores.set(id, color)
    usados.add(color)
  }
  return colores
}
