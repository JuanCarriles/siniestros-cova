import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type FiltroActivo = {
  /** Parámetro de la dirección que lo guarda (q, estado…) */
  clave: string
  /** "Estado", "Búsqueda" */
  etiqueta: string
  /** "En pericia", "«gomez»" */
  valor: string
}

// Los filtros aplicados a un listado, a la vista y con texto: explican por qué la lista es corta sin tener que
// revisar cada desplegable, y cada uno se quita con un toque. No se muestra si no hay ninguno.
export function FiltrosActivos({
  filtros,
  onQuitar,
  onQuitarTodos,
}: {
  filtros: FiltroActivo[]
  onQuitar: (clave: string) => void
  onQuitarTodos: () => void
}) {
  if (filtros.length === 0) return null
  return (
    <div
      role="group"
      aria-label="Filtros aplicados"
      className="mb-4 flex flex-wrap items-center gap-2"
    >
      <span className="font-semibold text-ink-2">Filtros aplicados:</span>
      {filtros.map((f) => (
        <button
          key={f.clave}
          type="button"
          onClick={() => onQuitar(f.clave)}
          aria-label={`Quitar ${f.etiqueta.toLowerCase()}: ${f.valor}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-primary/40 bg-surface py-1 pr-2 pl-4 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-offset-2"
        >
          <span>
            <span className="text-muted-foreground">{f.etiqueta}:</span>{' '}
            <span className="font-semibold">{f.valor}</span>
          </span>
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-primary">
            <X className="size-4" strokeWidth={3} aria-hidden="true" />
          </span>
        </button>
      ))}
      {filtros.length > 1 && (
        <Button variant="link" className="px-2" onClick={onQuitarTodos}>
          Quitar todos
        </Button>
      )}
    </div>
  )
}
