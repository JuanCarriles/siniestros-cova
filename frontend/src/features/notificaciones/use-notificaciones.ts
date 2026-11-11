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

export function useNotificaciones(
  consulta: ConsultaNotificaciones,
  lectura: 'ninguna' | 'visibles' | 'todas' = 'ninguna',
  activa = true,
) {
  const [revision, setRevision] = useState(0)
  const [resultado, setResultado] = useState<{
    clave: string
    datos: BandejaNotificaciones
  } | null>(null)
  const [error, setError] = useState<{ clave: string; mensaje: string } | null>(null)
  const entradaPendiente = useRef(true)
  const query = queryNotificaciones(consulta)
  const clave = `${query}|${revision}`
  useEffect(() => {
    if (!activa) return
    const controlador = new AbortController()
    void (async () => {
      // CU-08: entrar a la pantalla completa marca todas las propias como leídas una sola vez.
      // Refrescar o cambiar filtros no revierte un marcado manual posterior como no leída.
      if (lectura === 'todas' && entradaPendiente.current) {
        await leerNotificaciones({ todas: true }, controlador.signal)
        if (controlador.signal.aborted) return
        entradaPendiente.current = false
        actualizarNotificaciones()
      }
      const datos = await consultarNotificaciones(query, controlador.signal)
      if (lectura === 'visibles' && datos.items.length) {
        // No marcar avisos que no se mostraron: la página siguiente conserva sus no leídos.
        await leerNotificaciones({ ids: datos.items.map((a) => a.id) }, controlador.signal)
        datos.items = datos.items.map((a) => ({ ...a, leida: true }))
        if (!controlador.signal.aborted) actualizarNotificaciones()
      }
      if (!controlador.signal.aborted) {
        setResultado({ clave, datos })
        setError(null)
      }
    })().catch((err) => {
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
  return {
    ultimo: resultado?.datos ?? null,
    datos: resultado?.clave === clave ? resultado.datos : null,
    error: error?.clave === clave ? error.mensaje : null,
    actualizar,
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
