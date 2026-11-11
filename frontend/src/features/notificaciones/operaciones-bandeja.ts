import type {
  BandejaNotificaciones,
  LecturasNotificaciones,
} from '@cova/shared/schemas/bandeja-notificaciones'

export type LecturaAutomatica = 'ninguna' | 'visibles' | 'todas'
type Operaciones = {
  consultar: (query: string, signal: AbortSignal) => Promise<BandejaNotificaciones>
  leer: (body: LecturasNotificaciones, signal: AbortSignal) => Promise<unknown>
}

/** Una falla al marcar nunca debe ocultar los avisos que sí se pudieron consultar. */
export async function cargarBandeja(
  query: string,
  lectura: LecturaAutomatica,
  entradaPendiente: boolean,
  signal: AbortSignal,
  operaciones: Operaciones,
) {
  let avisoLectura: string | null = null
  let entradaLeida = false
  let marcoLectura = false
  const marcar = async (pedido: LecturasNotificaciones) => {
    try {
      await operaciones.leer(pedido, signal)
      signal.throwIfAborted()
      marcoLectura = true
      return true
    } catch {
      signal.throwIfAborted()
      avisoLectura =
        lectura === 'visibles'
          ? 'No se pudieron marcar las notificaciones como leídas. Podés consultarlas; cerrá y volvé a abrir el panel para reintentar.'
          : 'No se pudieron marcar las notificaciones como leídas. Podés consultarlas y reintentar con Actualizar.'
      return false
    }
  }
  if (lectura === 'todas' && entradaPendiente) entradaLeida = await marcar({ todas: true })
  const datos = await operaciones.consultar(query, signal)
  signal.throwIfAborted()
  if (lectura === 'visibles' && datos.items.length) {
    const marcadas = await marcar({ ids: datos.items.map((a) => a.id) })
    if (marcadas) {
      datos.sinLeer = Math.max(0, datos.sinLeer - datos.items.filter((a) => !a.leida).length)
      datos.items = datos.items.map((a) => ({ ...a, leida: true }))
    }
  }
  return { datos, avisoLectura, entradaLeida, marcoLectura }
}
