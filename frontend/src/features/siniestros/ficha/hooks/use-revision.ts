import { useRef } from 'react'
import { useRevalidator } from 'react-router'
import type { RegistroDesactualizado } from '@cova/shared/schemas/partes-siniestro'
import { ApiError } from '@/lib/api'

/**
 * La revisión del registro que se está modificando, tal como estaba al abrir el formulario (E5-06 y E5-07).
 * `abrir` la toma al abrir el modal; `guardar` la manda. Si otro usuario modificó el registro mientras tanto, el
 * servidor lo rechaza: el modal muestra el aviso, la ficha se actualiza detrás y la revisión pasa a la actual, así
 * que guardar de nuevo, ya avisado, reemplaza esos cambios.
 */
export function useRevision() {
  const revalidator = useRevalidator()
  const revision = useRef(0)
  return {
    abrir: (actual: number) => {
      revision.current = actual
    },
    async guardar(enviar: (revision: number) => Promise<void>) {
      try {
        await enviar(revision.current)
      } catch (err) {
        const detalle =
          err instanceof ApiError ? (err.detalles as RegistroDesactualizado | undefined) : undefined
        if (detalle?.codigo === 'REGISTRO_DESACTUALIZADO') {
          revision.current = detalle.revision
          void revalidator.revalidate()
        }
        throw err
      }
    },
  }
}
