import { useSearchParams } from 'react-router'
import { History } from 'lucide-react'
import type { TipoEventoHistorial } from '@cova/shared/schemas/enums'
import { roleLabels } from '@/components/layout/panel-navigation'
import { Aviso } from '@/components/aviso'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PestanaFicha, PestanaVacia } from '../components/pestana-ficha'
import { fechaHoraDe } from '../formato'
import { usePestana } from '../hooks/use-ficha'

const TIPOS: Record<TipoEventoHistorial, string> = {
  ALTA_SINIESTRO: 'Alta',
  MENSAJE: 'Mensaje',
  NOVEDAD: 'Novedad',
  DOCUMENTO: 'Documento',
  ASIGNACION: 'Asignación',
  REASIGNACION: 'Reasignación',
  CAMBIO_ESTADO: 'Cambio de estado',
  MODIFICACION_DATOS: 'Modificación de datos',
  BAJA_SINIESTRO: 'Baja',
  REACTIVACION_SINIESTRO: 'Reactivación',
  VEHICULO: 'Vehículo',
  PERSONA: 'Persona',
  ABOGADO: 'Abogado',
  PERITO: 'Perito',
}

/** Los grupos del filtro (E5-09), en el orden en que se muestran. Cada tipo de evento está en uno solo. */
const GRUPOS = [
  {
    id: 'alta',
    nombre: 'Alta y asignación',
    tipos: ['ALTA_SINIESTRO', 'ASIGNACION', 'REASIGNACION'],
  },
  {
    id: 'estado',
    nombre: 'Estado y bajas',
    tipos: ['CAMBIO_ESTADO', 'BAJA_SINIESTRO', 'REACTIVACION_SINIESTRO'],
  },
  { id: 'datos', nombre: 'Datos del caso', tipos: ['MODIFICACION_DATOS'] },
  { id: 'partes', nombre: 'Partes', tipos: ['VEHICULO', 'PERSONA', 'ABOGADO', 'PERITO'] },
  { id: 'documentos', nombre: 'Documentos', tipos: ['DOCUMENTO'] },
  { id: 'novedades', nombre: 'Novedades', tipos: ['NOVEDAD'] },
  { id: 'chat', nombre: 'Chat', tipos: ['MENSAJE'] },
] as const satisfies readonly { id: string; nombre: string; tipos: TipoEventoHistorial[] }[]
type Grupo = (typeof GRUPOS)[number]

const enGrupo = (grupo: Grupo, tipo: TipoEventoHistorial) =>
  (grupo.tipos as readonly TipoEventoHistorial[]).includes(tipo)

// Pestaña "Historial" (CU-10 1.i, E5-09): todo lo que pasó en el siniestro, del más nuevo al más viejo (el alta queda
// al final), con su tipo, descripción, quién lo hizo y cuándo (como era en ese momento). Una línea de tiempo: la fecha
// a la izquierda, el evento a la derecha. Solo lectura: los eventos los registra el sistema. El filtro por tipo solo
// cambia lo que se ve; queda en la dirección (?tipo=partes) para volver al mismo lugar, aunque ese tipo no tenga
// eventos. Un siniestro sin su alta registrada se cargó antes de esta historia: se avisa que puede estar incompleto.
export function PestanaHistorial() {
  const eventos = usePestana<'historial'>()
  const [parametros, setParametros] = useSearchParams()
  const presentes = GRUPOS.flatMap((g) => {
    const cantidad = eventos.filter((e) => enGrupo(g, e.tipo)).length
    return cantidad ? [{ ...g, cantidad }] : []
  })
  const pedido = GRUPOS.find((g) => g.id === parametros.get('tipo'))
  const elegido = pedido
    ? (presentes.find((g) => g.id === pedido.id) ?? { ...pedido, cantidad: 0 })
    : null
  const botones = elegido && !elegido.cantidad ? [...presentes, elegido] : presentes
  const visibles = elegido ? eventos.filter((e) => enGrupo(elegido, e.tipo)) : eventos
  const sinAlta = !eventos.some((e) => e.tipo === 'ALTA_SINIESTRO')

  const elegir = (id: string | null) =>
    setParametros(
      (actuales) => {
        const nuevos = new URLSearchParams(actuales)
        if (id) nuevos.set('tipo', id)
        else nuevos.delete('tipo')
        return nuevos
      },
      { replace: true, preventScrollReset: true },
    )

  return (
    <PestanaFicha
      titulo="Historial"
      cantidad={eventos.length}
      nota="Lo registra el sistema: no se puede modificar"
    >
      {eventos.length === 0 ? (
        <PestanaVacia icono={History}>Todavía no hay eventos registrados.</PestanaVacia>
      ) : (
        <>
          {sinAlta && (
            <Aviso tipo="info" className="mb-5">
              Este siniestro se cargó antes de que el historial registrara el alta y las partes
              cargadas en ella: lo anterior a esta versión del sistema puede estar incompleto.
            </Aviso>
          )}
          {(botones.length > 1 || elegido) && (
            <div className="mb-5 grid gap-3">
              <div
                role="group"
                aria-label="Mostrar en el historial"
                className="flex flex-wrap gap-2"
              >
                {[{ id: null, nombre: 'Todos', cantidad: eventos.length }, ...botones].map((g) => {
                  const activo = (elegido?.id ?? null) === g.id
                  return (
                    <button
                      key={g.id ?? 'todos'}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => elegir(g.id)}
                      className={cn(
                        'inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 text-base font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
                        activo
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-line bg-surface text-ink-2 hover:border-primary hover:bg-accent',
                      )}
                    >
                      {g.nombre}
                      <span
                        className={cn(
                          'rounded-md px-1.5 dato text-sm',
                          activo ? 'bg-on-navy text-navy' : 'bg-neutral-bg text-neutral-ink',
                        )}
                      >
                        {g.cantidad}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p role="status" className="text-muted-foreground">
                {elegido
                  ? `Se muestran ${visibles.length} de ${eventos.length} eventos: ${elegido.nombre.toLocaleLowerCase('es')}.`
                  : `Se muestran los ${eventos.length} eventos, del más nuevo al más viejo.`}
              </p>
            </div>
          )}
          {elegido && !visibles.length ? (
            <div className="grid justify-items-start gap-3 rounded-lg border-2 border-dashed border-line p-5">
              <p className="text-lg">
                No hay eventos de {elegido.nombre.toLocaleLowerCase('es')} en este siniestro.
              </p>
              <Button variant="outline" onClick={() => elegir(null)}>
                Ver todos los eventos
              </Button>
            </div>
          ) : null}
          <ol className="grid">
            {visibles.map((e) => (
              <li
                key={e.id}
                className="grid gap-x-5 gap-y-1 border-l-4 border-line py-3 pl-5 sm:grid-cols-[11rem_1fr] sm:border-l-0 sm:pl-0"
              >
                <time
                  dateTime={e.fecha}
                  className="pt-0.5 dato text-muted-foreground sm:text-right"
                >
                  {fechaHoraDe(e.fecha)}
                </time>
                <div
                  className={cn(
                    'grid gap-1 sm:border-l-4 sm:pl-5',
                    e.tipo === 'ALTA_SINIESTRO' ? 'sm:border-brand-accent' : 'sm:border-line',
                  )}
                >
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
        </>
      )}
    </PestanaFicha>
  )
}
