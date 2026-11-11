import { useEffect, useState } from 'react'
import type { ResumenNotificaciones } from '@cova/shared/schemas/bandeja-notificaciones'
import { consultarResumenNotificaciones } from './api'
import { suscribirActualizacionNotificaciones } from './actualizar-notificaciones'

/** La campana consulta solo los conteos. Volver a la pestaña genera un único pedido, no focus + visibilitychange. */
export function useResumenNotificaciones() {
  const [resumen, setResumen] = useState<ResumenNotificaciones | null>(null)
  useEffect(() => {
    let controlador: AbortController | undefined
    const actualizar = () => {
      if (document.hidden) return
      controlador?.abort()
      const pedido = new AbortController()
      controlador = pedido
      void consultarResumenNotificaciones(pedido.signal)
        .then((datos) => {
          if (!pedido.signal.aborted) setResumen(datos)
        })
        .catch(() => {
          // Conservar el último contador; la apertura del panel muestra los errores de consulta.
        })
    }
    actualizar()
    const intervalo = window.setInterval(actualizar, 60000)
    const desuscribir = suscribirActualizacionNotificaciones(actualizar)
    document.addEventListener('visibilitychange', actualizar)
    return () => {
      controlador?.abort()
      clearInterval(intervalo)
      desuscribir()
      document.removeEventListener('visibilitychange', actualizar)
    }
  }, [])
  return resumen
}
