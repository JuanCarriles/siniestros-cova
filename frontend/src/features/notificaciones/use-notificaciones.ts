import { useCallback, useEffect, useRef, useState } from 'react'
import {
  queryNotificaciones,
  type ConsultaNotificaciones,
  type BandejaNotificaciones,
  type NotificacionBandeja,
} from '@cova/shared/schemas/bandeja-notificaciones'
import { ApiError } from '@/lib/api'
import { actualizarNotificaciones } from './actualizar-notificaciones'
import { consultarNotificaciones, leerNotificaciones } from './api'
import { cargarBandeja, type LecturaAutomatica } from './operaciones-bandeja'

export function useNotificaciones(
  consulta: ConsultaNotificaciones,
  lectura: LecturaAutomatica = 'ninguna',
  activa = true,
) {
  const [revision, setRevision] = useState(0)
  const [resultado, setResultado] = useState<{
    clave: string
    query: string
    datos: BandejaNotificaciones
    avisoLectura: string | null
  } | null>(null)
  const [error, setError] = useState<{ clave: string; mensaje: string } | null>(null)
  const entradaPendiente = useRef(true)
  const query = queryNotificaciones(consulta)
  const clave = `${query}|${revision}`
  useEffect(() => {
    if (!activa) return
    const controlador = new AbortController()
    void cargarBandeja(query, lectura, entradaPendiente.current, controlador.signal, {
      consultar: consultarNotificaciones,
      leer: leerNotificaciones,
    })
      .then(({ datos, avisoLectura, entradaLeida, marcoLectura }) => {
        if (controlador.signal.aborted) return
        if (entradaLeida) entradaPendiente.current = false
        setResultado({ clave, query, datos, avisoLectura })
        setError(null)
        if (marcoLectura) actualizarNotificaciones()
      })
      .catch((err) => {
        if (!controlador.signal.aborted)
          setError({
            clave,
            mensaje:
              err instanceof ApiError
                ? err.message
                : 'No se pudieron consultar las notificaciones. Probá actualizar.',
          })
      })
    return () => controlador.abort()
  }, [query, clave, activa, lectura])
  const actualizar = useCallback(() => setRevision((r) => r + 1), [])
  const confirmarEntradaLeida = useCallback(() => {
    entradaPendiente.current = false
  }, [])
  const datos = resultado?.query === query ? resultado.datos : null
  return {
    datos,
    error: error?.clave === clave ? error.mensaje : null,
    avisoLectura: resultado?.query === query ? resultado.avisoLectura : null,
    // Conservar el DOM durante el refresco mantiene el botón y la posición del usuario.
    actualizando: activa && resultado?.clave !== clave && error?.clave !== clave,
    actualizar,
    confirmarEntradaLeida,
    aplicar: (id: number, cambios: Partial<Pick<NotificacionBandeja, 'leida' | 'revisada'>>) =>
      setResultado((actual) =>
        actual
          ? {
              ...actual,
              datos: {
                ...actual.datos,
                items: actual.datos.items.map((a) => (a.id === id ? { ...a, ...cambios } : a)),
              },
            }
          : null,
      ),
  }
}
