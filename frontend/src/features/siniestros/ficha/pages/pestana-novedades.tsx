import { Megaphone } from 'lucide-react'
import { PestanaFicha, PestanaVacia } from '../components/pestana-ficha'
import { fechaHoraDe } from '../formato'
import { usePestana } from '../hooks/use-ficha'

// Pestaña "Novedades" (CU-10 1.f): en orden cronológico, con su autor y su fecha y hora
export function PestanaNovedades() {
  const novedades = usePestana<'novedades'>()
  return (
    <PestanaFicha titulo="Novedades" cantidad={novedades.length}>
      {novedades.length === 0 ? (
        <PestanaVacia icono={Megaphone}>
          Todavía no se cargaron novedades en este siniestro.
        </PestanaVacia>
      ) : (
        <ol className="grid gap-4">
          {novedades.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border-2 border-l-8 border-line border-l-brand-accent bg-card p-4"
            >
              <p className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <strong className="text-lg">{n.autor}</strong>
                <time dateTime={n.fechaCarga} className="dato text-muted-foreground">
                  {fechaHoraDe(n.fechaCarga)}
                </time>
              </p>
              <p className="text-reading whitespace-pre-line">{n.descripcion}</p>
            </li>
          ))}
        </ol>
      )}
    </PestanaFicha>
  )
}
