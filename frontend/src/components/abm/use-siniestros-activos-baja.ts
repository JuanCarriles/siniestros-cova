import { useEffect, useState } from 'react'
import {
  siniestrosActivosAsociadosSchema,
  type SiniestrosActivosAsociados,
} from '@cova/shared/schemas/siniestros-asociados'
import { api, ApiError } from '@/lib/api'

export function useSiniestrosActivosBaja({
  tipo,
  id,
  habilitado,
}: {
  tipo: 'usuario' | 'ajustador'
  id?: number
  habilitado: boolean
}) {
  const [pagina, setPagina] = useState(1)
  const [revision, setRevision] = useState(0)
  const [respuesta, setRespuesta] = useState<{
    clave: string
    datos?: SiniestrosActivosAsociados
    error?: string
  } | null>(null)
  const clave = `${tipo}-${id}-${pagina}-${revision}`
  useEffect(() => {
    if (!habilitado || !id) return
    const controlador = new AbortController()
    const modulo = tipo === 'usuario' ? 'usuarios' : 'ajustadores'
    void api(`/${modulo}/${id}/siniestros-activos?pagina=${pagina}`, { signal: controlador.signal })
      .then((datos) => {
        if (!controlador.signal.aborted) {
          setRespuesta({ clave, datos: siniestrosActivosAsociadosSchema.parse(datos) })
        }
      })
      .catch((error: unknown) => {
        if (!controlador.signal.aborted)
          setRespuesta({
            clave,
            error:
              error instanceof ApiError
                ? error.message
                : 'No se pudieron consultar los siniestros. Probá de nuevo.',
          })
      })
    return () => controlador.abort()
  }, [tipo, id, pagina, clave, habilitado])
  const vigente = respuesta?.clave === clave ? respuesta : null
  return {
    datos: vigente?.datos,
    error: vigente?.error,
    cargando: habilitado && !vigente,
    verificada: Boolean(vigente?.datos),
    anterior: () => setPagina((actual) => Math.max(1, actual - 1)),
    siguiente: () => setPagina((actual) => actual + 1),
    actualizar: () => {
      setPagina(1)
      setRevision((actual) => actual + 1)
    },
  }
}
export type ConsultaSiniestrosActivosBaja = ReturnType<typeof useSiniestrosActivosBaja>
