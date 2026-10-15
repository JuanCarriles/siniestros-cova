import * as React from 'react'
import { cn } from '@/lib/utils'

// El contenedor se desplaza en horizontal cuando la tabla no entra (celulares, zoom alto). Solo en ese caso es
// enfocable, para poder desplazarlo con las flechas del teclado; si entra completa, no suma una parada de Tab.
function useDesborda<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)
  const [desborda, setDesborda] = React.useState(false)
  React.useEffect(() => {
    const elemento = ref.current
    if (!elemento) return
    const medir = () => setDesborda(elemento.scrollWidth > elemento.clientWidth + 1)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(elemento)
    if (elemento.firstElementChild) observador.observe(elemento.firstElementChild)
    return () => observador.disconnect()
  }, [])
  return [ref, desborda] as const
}

function Table({
  className,
  containerLabel = 'Tabla de datos',
  ...props
}: React.ComponentProps<'table'> & { containerLabel?: string }) {
  const [ref, desborda] = useDesborda<HTMLDivElement>()
  return (
    <div
      ref={ref}
      data-slot="table-container"
      role={desborda ? 'region' : undefined}
      aria-label={desborda ? containerLabel : undefined}
      tabIndex={desborda ? 0 : undefined}
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-base', className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('[&_tr]:border-b-2 [&_tr]:border-line-strong', className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-t-2 border-line-strong bg-muted font-semibold [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  )
}

// Filas alternas para seguir una fila con la vista, resaltado bajo el puntero y fila seleccionada con fondo
// azul y una barra a la izquierda (se distingue aunque no se perciba bien el color).
// Para marcarla: <TableRow data-state="selected">.
function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-line-strong transition-colors odd:bg-surface even:bg-row-alt hover:bg-row-hover has-aria-expanded:bg-row-hover data-[state=selected]:bg-row-selected data-[state=selected]:shadow-[inset_4px_0_0_var(--color-navy)]',
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'bg-muted px-4 py-4 text-left align-middle text-base font-semibold whitespace-normal text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'px-4 py-3 align-middle whitespace-normal [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-base text-muted-foreground', className)}
      {...props}
    />
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
