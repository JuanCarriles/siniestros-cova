import { useId } from 'react'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

// Barra de arriba de un ABM (aseguradoras, ajustadores, usuarios…): buscador, "Mostrar dadas de baja" y el
// botón de alta. Va sobre el fondo de la página, separada de la tarjeta del listado (mockups).
export function BarraAbm({
  busqueda,
  onBusqueda,
  placeholderBusqueda,
  mostrarBajas,
  onMostrarBajas,
  etiquetaBajas = 'Mostrar dadas de baja',
  etiquetaAlta,
  onAlta,
}: {
  busqueda: string
  onBusqueda: (valor: string) => void
  /** Qué se puede buscar, p. ej. "Buscar por nombre". También es la etiqueta para el lector de pantalla. */
  placeholderBusqueda: string
  mostrarBajas?: boolean
  onMostrarBajas?: (mostrar: boolean) => void
  etiquetaBajas?: string
  /** Texto del botón de alta, p. ej. "Nueva aseguradora". Sin él no se muestra el botón. */
  etiquetaAlta?: string
  onAlta?: () => void
}) {
  const id = useId()
  return (
    <div className="mb-5 flex flex-wrap items-stretch gap-3">
      <div className="relative min-w-64 flex-1 basis-80">
        <label htmlFor={id} className="sr-only">
          {placeholderBusqueda}
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-muted"
          aria-hidden="true"
        />
        <Input
          id={id}
          type="search"
          autoComplete="off"
          placeholder={placeholderBusqueda}
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          className="h-13 pl-12 shadow-card"
        />
      </div>
      <div className="flex flex-1 flex-wrap gap-3 sm:flex-none">
        {onMostrarBajas && (
          <label className="flex min-h-13 flex-1 cursor-pointer items-center gap-3 rounded-md border border-input bg-surface px-4 font-medium whitespace-nowrap shadow-card hover:bg-accent sm:flex-none">
            <Checkbox
              className="size-6"
              checked={mostrarBajas}
              onChange={(e) => onMostrarBajas(e.target.checked)}
            />
            {etiquetaBajas}
          </label>
        )}
        {etiquetaAlta && onAlta && (
          <Button
            size="lg"
            className="min-h-13 flex-1 whitespace-nowrap sm:flex-none"
            onClick={onAlta}
          >
            <Plus aria-hidden="true" />
            {etiquetaAlta}
          </Button>
        )}
      </div>
    </div>
  )
}
