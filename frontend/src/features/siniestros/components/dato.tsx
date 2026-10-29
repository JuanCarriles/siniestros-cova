import type { ReactNode } from 'react'

// Un dato con su etiqueta, dentro de un <dl>: la etiqueta chica arriba y el valor abajo. Sin valor, "Sin dato".
// Lo usan los modales de contacto del listado y la ficha del siniestro.
export function Dato({
  etiqueta,
  children,
  ancho = false,
}: {
  etiqueta: string
  children: ReactNode
  /** Ocupa toda la fila de la grilla (textos largos) */
  ancho?: boolean
}) {
  const vacio = children === null || children === undefined || children === ''
  return (
    <div
      className={
        // min-w-0: un email largo se corta en vez de pisar la columna de al lado
        ancho
          ? 'grid min-w-0 content-start gap-0.5 sm:col-span-full'
          : 'grid min-w-0 content-start gap-0.5'
      }
    >
      <dt className="text-sm text-muted-foreground">{etiqueta}</dt>
      <dd className="[overflow-wrap:anywhere]">
        {vacio ? <span className="text-muted-foreground">Sin dato</span> : children}
      </dd>
    </div>
  )
}
