import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { roleLabels } from '@/components/layout/panel-navigation'
import { previews } from './panel-preview-data'

export function PanelPreviewHome() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-20">
      <Badge variant="info">Vista previa de interfaces</Badge>
      <h1 className="mt-6 text-3xl font-bold text-primary">Un espacio para cada rol.</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
        Explorá la navegación de Estudio Cova. Estas vistas usan usuarios de ejemplo y todavía no
        muestran datos reales.
      </p>
      <div className="mt-10 grid gap-4">
        {previews.map(({ slug, user, description, icon: Icon }) => (
          <Link
            key={slug}
            to={`/vista-previa/${slug}`}
            className="group flex flex-wrap items-center gap-5 rounded-xl border bg-card p-6 shadow-card transition-colors hover:border-input sm:p-8"
          >
            <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Icon className="size-7" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 basis-48">
              <span className="block text-xl font-semibold text-primary">
                {roleLabels[user.tipo]}
              </span>
              <span className="mt-1 block text-muted-foreground">{description}</span>
            </span>
            <ArrowRight className="size-6 text-primary" aria-hidden="true" />
          </Link>
        ))}
      </div>
      <Button asChild variant="link" className="mt-6 px-0">
        <Link to="/sistema-diseno">Consultar componentes del sistema de diseño</Link>
      </Button>
    </main>
  )
}
