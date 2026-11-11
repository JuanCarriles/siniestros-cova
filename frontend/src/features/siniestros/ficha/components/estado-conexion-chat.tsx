import { LoaderCircle, Wifi } from 'lucide-react'
import { Aviso } from '@/components/aviso'
import type { EstadoConexion, EstadoSala } from '@/lib/tiempo-real'

// Estado de la conexión del chat (E7-01 y E7-02 "Aviso visible si se pierde la conexión"). Siempre con texto e
// ícono, no solo color. La pérdida usa role="alert": el lector de pantalla la anuncia aunque el foco esté en el
// cuadro para escribir.
export function EstadoConexionChat({
  conexion,
  sala,
}: {
  conexion: EstadoConexion
  sala: EstadoSala
}) {
  if (sala.tipo === 'sin-acceso')
    return <Aviso tipo="error">No podés ver el chat de este siniestro. {sala.motivo}</Aviso>
  if (conexion === 'reconectando')
    return (
      <Aviso tipo="error">
        Se perdió la conexión con el chat. Se reintenta automáticamente: cuando vuelva, se cargan
        los mensajes que hayan llegado mientras tanto.
      </Aviso>
    )
  if (conexion === 'conectada' && sala.tipo === 'unida')
    return (
      <p role="status" className="flex items-center gap-2 font-semibold text-ok-ink">
        <Wifi className="size-5 shrink-0" aria-hidden="true" />
        Conectado: los mensajes llegan al instante.
      </p>
    )
  return (
    <p role="status" className="flex items-center gap-2 text-muted-foreground">
      <LoaderCircle className="size-5 shrink-0 animate-spin" aria-hidden="true" />
      Conectando con el chat…
    </p>
  )
}
