import { Link, useLocation, useNavigate } from 'react-router'
import { ChevronLeft, FileText } from 'lucide-react'
import { usePanel } from '@/components/layout/panel-context'
import { SectionHeading } from '@/components/layout/section-heading'
import { Button } from '@/components/ui/button'

// Destino de "Ver el siniestro" en el listado. La ficha completa llega con CU-10 (Gestionar siniestro).
export function FichaSiniestroPage() {
  const { basePath } = usePanel()
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <>
      <Button asChild variant="link" className="mb-3 px-0">
        <Link
          to={`${basePath}/siniestros`}
          onClick={(e) => {
            // Si se llegó navegando dentro del sistema (desde el listado), vuelve con sus filtros y su página
            if (location.key !== 'default') {
              e.preventDefault()
              void navigate(-1)
            }
          }}
        >
          <ChevronLeft aria-hidden="true" /> Volver al listado
        </Link>
      </Button>
      <SectionHeading
        section="siniestros"
        titulo="Ficha del siniestro"
        descripcion="Todos los datos del caso, sus partes, documentos, novedades e historial."
      />
      <section className="flex flex-wrap items-center gap-6 rounded-xl border bg-card px-6 py-10 shadow-card sm:px-10">
        <span
          className="grid size-16 place-items-center rounded-2xl bg-callout-bg text-primary"
          aria-hidden="true"
        >
          <FileText className="size-8" />
        </span>
        <p className="max-w-xl text-muted-foreground">
          La ficha del siniestro todavía está en construcción. Mientras tanto, los datos de contacto
          de las partes se pueden ver desde el listado.
        </p>
      </section>
    </>
  )
}
