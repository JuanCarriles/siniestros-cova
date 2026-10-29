import type { ReactNode } from 'react'
import {
  Building2,
  CalendarDays,
  Clock,
  Eye,
  UserRound,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react'
import type { FichaSiniestro } from '@cova/shared/schemas/ficha-siniestro'
import { Aviso } from '@/components/aviso'
import { EstadoChip } from '@/components/estado-chip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DiasSinMovimiento } from '../../components/celdas-siniestro'
import { fechaDe } from '../formato'

// Las filas de la cabecera usan la misma grilla que los grupos de pestañas: el nombre de la fila en la misma
// columna, así la cabecera y las pestañas quedan alineadas como un solo bloque
const FILA = 'grid gap-2 p-3 @6xl:grid-cols-[8.5rem_1fr] @6xl:items-center @6xl:gap-3 @6xl:px-4'
const NOMBRE_FILA = 'px-1 text-sm font-bold tracking-wide text-muted-foreground uppercase'

// Un dato de la asignación, con el mismo aspecto que una pestaña: en grilla es un recuadro; en fila, el ícono en su
// cuadrado de color y el texto, repartidos a lo ancho
function Dato({
  icono: Icono,
  etiqueta,
  className,
  accion,
  children,
}: {
  icono: LucideIcon
  etiqueta: string
  className?: string
  /** Botón al lado del dato (no dentro): así la etiqueta y el valor quedan a la altura de los demás */
  accion?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex min-h-12 min-w-0 rounded-xl border-2 border-line bg-card px-3 py-2',
        // Celular: el ícono arriba y el dato abajo con todo el ancho, como las pestañas. Con más lugar, en una línea.
        'flex-col items-start gap-1.5 @2xl:flex-row @2xl:items-center @2xl:gap-2.5',
        // En fila, alineados arriba: si un nombre ocupa dos líneas, las etiquetas siguen a la misma altura
        '@6xl:col-span-1 @6xl:items-start @6xl:gap-3 @6xl:border-transparent @6xl:bg-transparent @6xl:px-0',
        className,
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-info-bg text-info-ink @6xl:size-10">
        <Icono className="size-5" aria-hidden="true" />
      </span>
      <div className="grid min-w-0 gap-0.5 leading-tight">
        <dt className="text-sm font-semibold text-muted-foreground">{etiqueta}</dt>
        <dd className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold [overflow-wrap:anywhere]">
          {children}
        </dd>
      </div>
      {accion}
    </div>
  )
}

// Cabecera de la ficha (CU-10 paso 1, E5-01), igual en todas las pestañas: número, estado y quién lleva el caso
export function CabeceraFicha({
  ficha,
  onVerAjustador,
}: {
  ficha: FichaSiniestro
  onVerAjustador: () => void
}) {
  return (
    <header className="@container mb-4 overflow-hidden rounded-2xl border bg-card shadow-card">
      <div className={FILA}>
        <p className={NOMBRE_FILA}>Siniestro</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
          <h1 className="dato text-3xl font-bold tracking-tight text-primary @xl:text-4xl">
            <span className="sr-only">Siniestro </span>
            {ficha.numeroSiniestro}
          </h1>
          <EstadoChip estado={ficha.estado.nombre} className="text-base" />
        </div>
      </div>

      {ficha.fechaBaja && (
        <Aviso tipo="info" className="mx-3 mb-3">
          Este siniestro está dado de baja desde el {fechaDe(ficha.fechaBaja)}. Solo lo ven los
          administradores.
        </Aviso>
      )}

      <div className={cn(FILA, 'border-t-2 border-line bg-surface-subtle')}>
        <p className={NOMBRE_FILA}>Asignación</p>
        {/* Con dos columnas: los cuatro datos cortos de a pares y el ajustador debajo. Con seis: los tres primeros en
            una fila y el resto en la otra, sin huecos. Con lugar, cinco columnas a lo ancho: si un nombre no entra, se
            corta dentro de su columna en vez de mandar el dato a otra fila. */}
        <dl className="grid grid-cols-2 gap-2 @4xl:grid-cols-6 @6xl:grid-cols-[repeat(5,auto)] @6xl:justify-between @6xl:gap-x-6 @6xl:pr-2">
          <Dato icono={Building2} etiqueta="Aseguradora" className="@4xl:col-span-2">
            {ficha.aseguradora.nombre}
          </Dato>
          <Dato icono={UserRoundCheck} etiqueta="Usuario asignado" className="@4xl:col-span-2">
            {ficha.asignado.nombre}
          </Dato>
          <Dato icono={CalendarDays} etiqueta="Asignado el" className="@4xl:col-span-2">
            <span className="dato">{fechaDe(ficha.fechaAsignacion)}</span>
          </Dato>
          <Dato icono={Clock} etiqueta="Sin movimiento" className="@4xl:col-span-3">
            {/* El semáforo es más alto que una línea de texto: sin agrandar la fila */}
            <span className="-my-1.5 inline-flex">
              <DiasSinMovimiento dias={ficha.diasSinMovimiento} cerrado={ficha.estado.esCierre} />
            </span>
            <span aria-hidden="true">{ficha.diasSinMovimiento === 1 ? 'día' : 'días'}</span>
          </Dato>
          {/* Con el botón necesita más ancho: va último y ocupa la fila entera o la mitad */}
          <Dato
            icono={UserRound}
            etiqueta="Ajustador"
            className="col-span-2 @4xl:col-span-3"
            accion={
              ficha.ajustador && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 font-semibold @2xl:ml-auto @6xl:ml-1"
                  onClick={onVerAjustador}
                  aria-label={`Ver datos del ajustador ${ficha.ajustador.nombre}`}
                >
                  <Eye aria-hidden="true" />
                  Ver datos
                </Button>
              )
            }
          >
            {ficha.ajustador?.nombre ?? (
              <span className="font-normal text-muted-foreground">Sin asignar</span>
            )}
          </Dato>
        </dl>
      </div>
    </header>
  )
}
