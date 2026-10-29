import { History } from 'lucide-react'
import type { TipoEventoHistorial } from '@cova/shared/schemas/enums'
import { roleLabels } from '@/components/layout/panel-navigation'
import { PestanaFicha, PestanaVacia } from '../components/pestana-ficha'
import { fechaHoraDe } from '../formato'
import { usePestana } from '../hooks/use-ficha'

const TIPOS: Record<TipoEventoHistorial, string> = {
  MENSAJE: 'Mensaje',
  NOVEDAD: 'Novedad',
  DOCUMENTO: 'Documento',
  ASIGNACION: 'Asignación',
  REASIGNACION: 'Reasignación',
  CAMBIO_ESTADO: 'Cambio de estado',
  BAJA_SINIESTRO: 'Baja',
  REACTIVACION_SINIESTRO: 'Reactivación',
}

// Pestaña "Historial" (CU-10 1.i): lo que pasó en el siniestro en orden cronológico, con su tipo, quién lo hizo y
// cuándo. Una línea de tiempo: la fecha a la izquierda, el evento a la derecha.
export function PestanaHistorial() {
  const eventos = usePestana<'historial'>()
  return (
    <PestanaFicha titulo="Historial" cantidad={eventos.length}>
      {eventos.length === 0 ? (
        <PestanaVacia icono={History}>Todavía no hay eventos registrados.</PestanaVacia>
      ) : (
        <ol className="grid">
          {eventos.map((e) => (
            <li
              key={e.id}
              className="grid gap-x-5 gap-y-1 border-l-4 border-line py-3 pl-5 sm:grid-cols-[11rem_1fr] sm:border-l-0 sm:pl-0"
            >
              <time dateTime={e.fecha} className="pt-0.5 dato text-muted-foreground sm:text-right">
                {fechaHoraDe(e.fecha)}
              </time>
              <div className="grid gap-1 sm:border-l-4 sm:border-line sm:pl-5">
                <p className="w-fit rounded bg-neutral-bg px-2 text-sm font-bold tracking-wide text-neutral-ink uppercase">
                  {TIPOS[e.tipo]}
                </p>
                <p className="text-lg">{e.descripcion}</p>
                <p className="text-muted-foreground">
                  {e.usuario.nombre} · {roleLabels[e.usuario.tipoUsuario]}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </PestanaFicha>
  )
}
