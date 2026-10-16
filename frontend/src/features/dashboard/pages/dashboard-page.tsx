import { Link } from 'react-router'
import { ArrowRight, ChevronRight, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePanel } from '@/components/layout/panel-context'
import { navigationFor, sections } from '@/components/layout/panel-navigation'
import { sectionIcons } from '@/components/layout/panel-icons'
import { SectionHeading } from '@/components/layout/section-heading'

// Inicio de administradores y superadministradores: accesos a cada sección del estudio.
export function DashboardPage() {
  const { usuario, basePath } = usePanel()
  return (
    <>
      <SectionHeading section="dashboard" />
      <section
        aria-labelledby="workspace-title"
        className="overflow-hidden rounded-xl border bg-card shadow-card"
      >
        <div className="grid gap-6 border-b p-6 sm:p-8 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <p className="mb-2 text-sm font-semibold text-muted-foreground">
              ADMINISTRACIÓN DEL ESTUDIO
            </p>
            <h2 id="workspace-title" className="text-2xl font-semibold text-primary">
              Cada caso, un equipo detrás.
            </h2>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Accedé a los siniestros, las compañías y las personas que forman parte del trabajo
              diario.
            </p>
          </div>
          <Button asChild className="w-full sm:w-fit">
            <Link to={`${basePath}/siniestros`}>
              <FolderOpen aria-hidden="true" />
              Ir a siniestros
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <div className="p-6 sm:p-8">
          <h3 className="mb-5 font-semibold">Secciones del estudio</h3>
          <div className="grid gap-x-8 md:grid-cols-2">
            {navigationFor(usuario.tipo)
              .filter((item) => item !== 'dashboard')
              .map((section) => {
                const Icon = sectionIcons[section]
                return (
                  <Link
                    key={section}
                    to={`${basePath}/${section}`}
                    className="group flex min-h-24 items-center gap-4 rounded-lg border-b px-2 py-5 transition-colors hover:bg-accent"
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-accent text-primary">
                      <Icon className="size-6" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-primary">
                        {sections[section].label}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {sections[section].description}
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-primary" aria-hidden="true" />
                  </Link>
                )
              })}
          </div>
        </div>
      </section>
    </>
  )
}
