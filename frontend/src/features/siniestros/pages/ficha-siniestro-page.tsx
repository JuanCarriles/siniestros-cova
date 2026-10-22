import { Link, useLoaderData, useLocation, useNavigate } from 'react-router'
import { ChevronLeft, FileText } from 'lucide-react'
import { usePanel } from '@/components/layout/panel-context'
import { SectionHeading } from '@/components/layout/section-heading'
import { EstadoChip } from '@/components/estado-chip'
import { Button } from '@/components/ui/button'
import type { cargarFichaSiniestro } from '../loader'

// Destino de "Ver el siniestro" en el listado. Por ahora muestra los datos básicos; la ficha completa llega con
// CU-10 (Gestionar siniestro). El acceso lo controla el loader (E4-03).
export function FichaSiniestroPage() {
  const { siniestro } = useLoaderData<typeof cargarFichaSiniestro>()
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
        titulo={`Siniestro ${siniestro.numeroSiniestro}`}
        descripcion="Todos los datos del caso, sus partes, documentos, novedades e historial."
      />
      <dl className="mb-6 grid gap-x-8 gap-y-4 rounded-xl border bg-card p-6 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-sm text-muted-foreground">Póliza</dt>
          <dd className="dato font-semibold">{siniestro.numeroPoliza}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Aseguradora</dt>
          <dd className="font-semibold">{siniestro.aseguradora.nombre}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Gestor</dt>
          <dd className="font-semibold">{siniestro.gestor.nombre}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Estado</dt>
          <dd>
            <EstadoChip estado={siniestro.estado.nombre} className="text-sm" />
          </dd>
        </div>
      </dl>
      <section className="flex flex-wrap items-center gap-6 rounded-xl border bg-card px-6 py-10 shadow-card sm:px-10">
        <span
          className="grid size-16 place-items-center rounded-2xl bg-callout-bg text-primary"
          aria-hidden="true"
        >
          <FileText className="size-8" />
        </span>
        <p className="max-w-xl text-muted-foreground">
          El resto de la ficha todavía está en construcción. Mientras tanto, los datos de contacto
          de las partes se pueden ver desde el listado.
        </p>
      </section>
    </>
  )
}
