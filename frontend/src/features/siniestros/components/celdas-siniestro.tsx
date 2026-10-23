import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Check, CircleMinus, Clock, Eye, TriangleAlert } from 'lucide-react'
import {
  DIAS_ALERTA,
  DIAS_DEMORADO,
  tonoDemora,
  type SiniestroListado,
} from '@cova/shared/schemas/siniestros'
import { EstadoChip } from '@/components/estado-chip'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { VistaPartes } from './partes-dialog'

// Celdas del listado de siniestros, compartidas por la tabla (escritorio) y las tarjetas (celular). Cada una ocupa
// como mucho dos líneas: el dato principal arriba y el secundario, más chico, abajo.

export type AlVer = (siniestro: SiniestroListado, vista: VistaPartes) => void

const fecha = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const vacio = (texto: string) => <span className="text-muted-foreground">{texto}</span>

// Enlace con aspecto de texto subrayado que abre un diálogo con datos de contacto
function BotonParte({
  children,
  etiqueta,
  onClick,
  ojo = false,
  className,
}: {
  children: ReactNode
  etiqueta: string
  onClick: () => void
  ojo?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      className={cn(
        'rounded text-left font-medium text-primary underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-offset-2',
        className,
      )}
    >
      {ojo && typeof children === 'string' ? (
        // El ícono va pegado a la última palabra: si el nombre ocupa dos líneas, no queda solo en una tercera
        <>
          {children.slice(0, children.lastIndexOf(' ') + 1)}
          <span className="whitespace-nowrap">
            {children.slice(children.lastIndexOf(' ') + 1)}
            <Eye className="ml-1 inline size-4 align-[-0.15em]" aria-hidden="true" />
          </span>
        </>
      ) : (
        children
      )}
    </button>
  )
}

export function CeldaSiniestro({ siniestro, href }: { siniestro: SiniestroListado; href: string }) {
  return (
    <div className="grid gap-0.5">
      <Link
        to={href}
        className="w-fit dato font-bold text-primary underline-offset-4 hover:underline"
        aria-label={`Ver el siniestro ${siniestro.numeroSiniestro}`}
      >
        {siniestro.numeroSiniestro}
      </Link>
      <span className="text-sm text-muted-foreground">
        Póliza <span className="dato">{siniestro.numeroPoliza}</span>
      </span>
      {siniestro.eliminado && (
        // En rojo y con ícono: tiene que llamar la atención aunque no se distinga bien el color
        <span className="mt-1 inline-flex w-fit items-center gap-1 rounded border-2 border-destructive bg-danger-bg px-1.5 text-sm font-bold text-danger-ink">
          <CircleMinus className="size-4 shrink-0" aria-hidden="true" />
          Dado de baja
        </span>
      )}
    </div>
  )
}

export function CeldaAsegurado({ siniestro }: { siniestro: SiniestroListado }) {
  return siniestro.asegurado ? (
    <span className="line-clamp-2">{siniestro.asegurado.nombre}</span>
  ) : (
    vacio('Sin cargar')
  )
}

// "Celdas de dos líneas para las partes": el primer tercero y, si hay más, cuántos y el acceso a todos (CU-09 3.c)
export function CeldaTerceros({ siniestro, onVer }: { siniestro: SiniestroListado; onVer: AlVer }) {
  const [primero, ...resto] = siniestro.terceros
  if (!primero) return vacio('Sin terceros')
  return (
    <div className="grid gap-0.5">
      <span className="line-clamp-2" title={primero.nombre}>
        {primero.nombre}
      </span>
      <span className="text-sm">
        {resto.length > 0 && <span className="text-muted-foreground">y {resto.length} más · </span>}
        <BotonParte
          etiqueta={`Ver ${siniestro.terceros.length === 1 ? 'los datos del tercero' : `los ${siniestro.terceros.length} terceros`} del siniestro ${siniestro.numeroSiniestro}`}
          onClick={() => onVer(siniestro, { tipo: 'terceros' })}
        >
          {resto.length > 0 ? `Ver los ${siniestro.terceros.length}` : 'Ver datos'}
        </BotonParte>
      </span>
    </div>
  )
}

export function CeldaAseguradora({
  siniestro,
  onVer,
}: {
  siniestro: SiniestroListado
  onVer: AlVer
}) {
  return (
    <div className="grid gap-0.5">
      <span className="line-clamp-2">{siniestro.aseguradora.nombre}</span>
      <span className="text-sm">
        {siniestro.ajustador ? (
          <BotonParte
            ojo
            etiqueta={`Ver los datos del ajustador ${siniestro.ajustador.nombre}`}
            onClick={() => onVer(siniestro, { tipo: 'ajustador' })}
          >
            {siniestro.ajustador.nombre}
          </BotonParte>
        ) : (
          vacio('Sin ajustador')
        )}
      </span>
    </div>
  )
}

export function CeldaGestor({ siniestro }: { siniestro: SiniestroListado }) {
  return (
    <div className="grid gap-0.5">
      <span className="line-clamp-2">{siniestro.gestor.nombre}</span>
      <span className="text-sm text-muted-foreground">
        <span className="sr-only">Asignado el </span>
        {/* Cifras de ancho fijo pero en la letra normal: la monoespaciada ensanchaba la columna */}
        <span className="whitespace-nowrap tabular-nums">
          {fecha.format(new Date(siniestro.fechaAsignacion))}
        </span>
      </span>
    </div>
  )
}

// El chip dice el estado; al pasar el mouse o enfocarlo, explica qué significa (mockup "Qué significa cada estado")
export function CeldaEstado({ siniestro }: { siniestro: SiniestroListado }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-block rounded-md focus-visible:outline-offset-2">
          <EstadoChip estado={siniestro.estado.nombre} className="px-2 text-sm" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        <p className="font-semibold">{siniestro.estado.nombre}</p>
        <p>{siniestro.estado.descripcion}</p>
      </TooltipContent>
    </Tooltip>
  )
}

const chipPericia =
  'inline-flex min-h-7 w-fit items-center gap-1 rounded-full border px-2 text-sm font-semibold whitespace-nowrap'

// Un chip por tipo de pericia: con borde lleno y clic para ver al perito si hay; punteado y gris si no hay
export function CeldaPericias({ siniestro, onVer }: { siniestro: SiniestroListado; onVer: AlVer }) {
  const pericias = [
    { tipo: 'CESVI', pericia: siniestro.pericias.cesvi },
    { tipo: 'Médica', pericia: siniestro.pericias.medico },
  ] as const
  return (
    <div className="flex flex-col gap-1">
      {pericias.map(({ tipo, pericia }) =>
        pericia ? (
          <button
            key={tipo}
            type="button"
            onClick={() => onVer(siniestro, { tipo: 'perito', id: pericia.id })}
            aria-label={`Ver al perito de la pericia ${tipo} (${pericia.cerrada ? 'cerrada' : 'en curso'})`}
            className={cn(
              chipPericia,
              'border-primary/50 bg-surface text-primary hover:bg-accent focus-visible:outline-offset-2',
            )}
          >
            {tipo}
            {pericia.cerrada && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
          </button>
        ) : (
          <span
            key={tipo}
            className={cn(
              chipPericia,
              'border-dashed border-line-strong font-medium text-muted-foreground',
            )}
          >
            Sin {tipo === 'CESVI' ? 'CESVI' : 'médica'}
          </span>
        ),
      )}
    </div>
  )
}

export function CeldaAbogado({ siniestro, onVer }: { siniestro: SiniestroListado; onVer: AlVer }) {
  const [primero, ...resto] = siniestro.abogados
  if (!primero) return vacio('Sin abogado')
  return (
    <div className="grid gap-0.5">
      <BotonParte
        ojo
        etiqueta={`Ver los datos ${resto.length ? 'de los abogados' : `del abogado ${primero.nombre}`}`}
        onClick={() => onVer(siniestro, { tipo: 'abogados' })}
      >
        {primero.nombre}
      </BotonParte>
      {resto.length > 0 && (
        <span className="text-sm text-muted-foreground">+{resto.length} más</span>
      )}
    </div>
  )
}

const tonos = {
  normal: 'bg-neutral-bg text-neutral-ink',
  demorado: 'bg-warning-bg text-warning-ink',
  alerta: 'bg-danger-bg text-danger-ink',
} as const

// Semáforo de días sin movimiento (RF-19). Además del color, un ícono y el texto para el lector de pantalla.
export function DiasSinMovimiento({
  dias,
  cerrado,
  conTexto = false,
}: {
  dias: number
  cerrado: boolean
  /** En las tarjetas: "4 días sin movimiento" a la vista */
  conTexto?: boolean
}) {
  const tono = tonoDemora(dias, cerrado)
  const Icono = tono === 'alerta' ? TriangleAlert : tono === 'demorado' ? Clock : null
  const detalle =
    tono === 'alerta'
      ? `, demorado hace ${DIAS_ALERTA} días o más`
      : tono === 'demorado'
        ? `, demorado (${DIAS_DEMORADO * 24} horas o más)`
        : ''
  return (
    <span
      className={cn(
        'inline-flex min-h-8 min-w-11 items-center justify-center gap-1 rounded-md px-2 font-bold whitespace-nowrap',
        tonos[tono],
      )}
    >
      {Icono && <Icono className="size-4" aria-hidden="true" />}
      <span className="dato">{dias}</span>
      {conTexto ? (
        <span className="font-semibold">
          {' '}
          {dias === 1 ? 'día' : 'días'} sin movimiento
          <span className="sr-only">{detalle}</span>
        </span>
      ) : (
        <span className="sr-only">
          {' '}
          {dias === 1 ? 'día' : 'días'} sin movimiento{detalle}
        </span>
      )}
    </span>
  )
}
