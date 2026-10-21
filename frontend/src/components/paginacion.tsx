import { Link } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// Páginas a mostrar: la primera, la última y las vecinas de la actual; el resto se resume con "…"
function paginasVisibles(actual: number, total: number): (number | null)[] {
  const visibles = new Set([1, total, actual - 1, actual, actual + 1])
  const lista = [...visibles].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  return lista.flatMap((n, i) => (i > 0 && n - lista[i - 1] > 1 ? [null, n] : [n]))
}

const boton =
  'inline-flex min-h-12 min-w-12 items-center justify-center gap-1 rounded-md border border-input bg-surface px-3 font-semibold transition-colors hover:bg-accent focus-visible:outline-offset-2'

// Paginación de un listado largo. Cada página es un enlace (?pagina=3): se puede abrir en otra pestaña y el
// navegador recuerda dónde estaba. Con un tamaño de página elegible ("25 por página").
export function Paginacion({
  pagina,
  porPagina,
  total,
  hrefPagina,
  opcionesPorPagina,
  onPorPagina,
  nombre = 'resultados',
}: {
  pagina: number
  porPagina: number
  total: number
  /** Dirección de una página, conservando los filtros */
  hrefPagina: (pagina: number) => string
  opcionesPorPagina?: readonly number[]
  onPorPagina?: (porPagina: number) => void
  /** "siniestros": para "Mostrando 26–50 de 112 siniestros" */
  nombre?: string
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  if (total === 0) return null
  const desde = (pagina - 1) * porPagina + 1
  const hasta = Math.min(total, pagina * porPagina)

  return (
    <nav
      aria-label="Páginas"
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t px-4 py-4 sm:px-6"
    >
      <p className="text-muted-foreground" aria-live="polite">
        Mostrando{' '}
        <span className="dato font-semibold text-foreground">
          {desde}–{hasta}
        </span>{' '}
        de <span className="dato font-semibold text-foreground">{total}</span> {nombre}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {opcionesPorPagina && onPorPagina && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Select value={String(porPagina)} onValueChange={(v) => onPorPagina(Number(v))}>
              <SelectTrigger
                aria-label={`${nombre} por página`}
                className="w-24 font-semibold text-foreground"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {opcionesPorPagina.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span aria-hidden="true">por página</span>
          </div>
        )}
        {paginas > 1 && (
          <ul className="flex flex-wrap items-center gap-1.5">
            <li>
              {pagina > 1 ? (
                <Link to={hrefPagina(pagina - 1)} className={boton} preventScrollReset>
                  <ChevronLeft className="size-5" aria-hidden="true" />
                  Anterior
                </Link>
              ) : (
                <span
                  className={cn(boton, 'cursor-not-allowed text-disabled-ink hover:bg-surface')}
                  aria-disabled="true"
                >
                  <ChevronLeft className="size-5" aria-hidden="true" />
                  Anterior
                </span>
              )}
            </li>
            {paginasVisibles(pagina, paginas).map((n, i) =>
              n === null ? (
                <li key={`hueco-${i}`} aria-hidden="true" className="px-1 text-muted-foreground">
                  …
                </li>
              ) : (
                <li key={n} className="hidden sm:block">
                  <Link
                    to={hrefPagina(n)}
                    preventScrollReset
                    aria-label={`Página ${n}`}
                    aria-current={n === pagina ? 'page' : undefined}
                    className={cn(
                      boton,
                      'dato',
                      n === pagina &&
                        'border-primary bg-primary text-primary-foreground hover:bg-primary',
                    )}
                  >
                    {n}
                  </Link>
                </li>
              ),
            )}
            <li className="px-2 font-semibold sm:hidden">
              Página {pagina} de {paginas}
            </li>
            <li>
              {pagina < paginas ? (
                <Link to={hrefPagina(pagina + 1)} className={boton} preventScrollReset>
                  Siguiente
                  <ChevronRight className="size-5" aria-hidden="true" />
                </Link>
              ) : (
                <span
                  className={cn(boton, 'cursor-not-allowed text-disabled-ink hover:bg-surface')}
                  aria-disabled="true"
                >
                  Siguiente
                  <ChevronRight className="size-5" aria-hidden="true" />
                </span>
              )}
            </li>
          </ul>
        )}
      </div>
    </nav>
  )
}
