import type { ReactNode } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { CircleAlert, type LucideIcon } from 'lucide-react'
import { MENSAJE_SIN_CONEXION } from '@/lib/api'
import { cn } from '@/lib/utils'

// Marco de cada pestaña: una tarjeta con su título arriba y el contenido abajo. Las acciones de cada historia
// (agregar, modificar…) van en `acciones`, a la derecha del título.
export function PestanaFicha({
  titulo,
  cantidad,
  nota,
  acciones,
  children,
}: {
  titulo: string
  cantidad?: number
  /** Texto corto a la derecha del título ("Un perito CESVI y uno médico como máximo") */
  nota?: string
  acciones?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby="titulo-pestana"
      className="overflow-hidden rounded-xl border bg-card shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-surface-subtle px-5 py-3">
        <h2
          id="titulo-pestana"
          className="flex items-center gap-2 text-base font-bold tracking-wider text-ink-2 uppercase"
        >
          {titulo}
          {cantidad !== undefined && (
            <span className="rounded-md bg-neutral-bg px-1.5 dato text-sm text-neutral-ink">
              {cantidad}
            </span>
          )}
        </h2>
        {nota && <p className="text-muted-foreground">{nota}</p>}
        {acciones}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

/** Un bloque dentro de una pestaña: ícono y título, y sus datos abajo */
export function BloqueFicha({
  icono: Icono,
  titulo,
  className,
  children,
}: {
  icono: LucideIcon
  titulo: string
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn('rounded-lg border-2 border-line bg-card p-5', className)}>
      <h3 className="mb-4 flex items-center gap-2.5 border-b-2 border-line pb-3 text-xl font-bold text-primary">
        <Icono className="size-6 shrink-0" aria-hidden="true" />
        {titulo}
      </h3>
      {children}
    </section>
  )
}

/** Pestaña sin nada cargado: dice qué falta, sin dejar la tarjeta en blanco */
export function PestanaVacia({
  icono: Icono,
  children,
}: {
  icono: LucideIcon
  children: ReactNode
}) {
  return (
    <div className="grid justify-items-center gap-3 px-6 py-10 text-center">
      <Icono className="size-9 text-muted-foreground" aria-hidden="true" />
      <p className="max-w-lg text-lg text-muted-foreground">{children}</p>
    </div>
  )
}

// Si falla la carga de una pestaña, el error queda adentro de ella: la cabecera y las demás pestañas siguen a mano
export function ErrorPestana() {
  const error = useRouteError()
  const motivo =
    isRouteErrorResponse(error) && typeof error.data === 'string' && error.data
      ? error.data
      : MENSAJE_SIN_CONEXION
  return (
    <section className="grid justify-items-center gap-3 rounded-xl border bg-card px-6 py-10 text-center shadow-card">
      <CircleAlert className="size-9 text-destructive" aria-hidden="true" />
      <h2 className="text-xl font-semibold text-primary">No se pudo cargar esta sección</h2>
      <p className="max-w-lg text-muted-foreground">{motivo}</p>
    </section>
  )
}
