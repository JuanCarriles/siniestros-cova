import { useId, type ReactNode, type Ref } from 'react'
import { Info } from 'lucide-react'

// Tarjeta del listado de un ABM: encabezado con la cantidad y un resumen, el contenido (TablaAbm) y una nota al
// pie con la regla que conviene tener a la vista (p. ej. cuándo se puede dar de baja).
export function ListadoAbm({
  titulo,
  resumen,
  aviso,
  nota,
  tituloRef,
  children,
}: {
  /** "6 aseguradoras": se anuncia al cambiar (al buscar o filtrar) */
  titulo: string
  /** Partes del resumen de la derecha, p. ej. ["5 activas", "6 ajustadores", "1 dada de baja"] */
  resumen?: string[]
  /** Mensaje de lo último que se hizo (Aviso), entre el encabezado y la tabla */
  aviso?: ReactNode
  nota?: ReactNode
  /** Para devolver el foco al listado cuando la fila de la que se partió ya no está */
  tituloRef?: Ref<HTMLHeadingElement>
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-xl border bg-card shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3 sm:px-6">
        <h2
          id={id}
          ref={tituloRef}
          tabIndex={-1}
          // Por debajo del encabezado de la tabla en jerarquía: dato de contexto, no un título que compita
          className="font-semibold text-ink-2 focus-visible:outline-offset-4"
          aria-live="polite"
        >
          {titulo}
        </h2>
        {resumen && resumen.length > 0 && (
          <p className="text-muted-foreground">
            {resumen.map((parte, i) => (
              <span key={parte}>
                {i > 0 && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span className="sr-only">, </span>
                  </>
                )}
                {parte}
              </span>
            ))}
          </p>
        )}
      </header>
      {aviso && <div className="px-4 pb-4 sm:px-6">{aviso}</div>}
      <div className="border-t border-line">{children}</div>
      {nota && (
        <p className="flex items-start gap-3 border-t bg-surface-subtle px-4 py-4 text-muted-foreground sm:px-6">
          <Info className="mt-1 size-5 shrink-0" aria-hidden="true" />
          <span>{nota}</span>
        </p>
      )}
    </section>
  )
}
