import { Link, useParams } from 'react-router'
import {
  ArrowDownToLine,
  ArrowRight,
  ChevronRight,
  FolderOpen,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePanel } from '@/components/layout/panel-context'
import {
  canOpenSection,
  initialSection,
  navigationFor,
  roleLabels,
  sections,
  type PanelSection,
} from '@/components/layout/panel-navigation'
import { sectionIcons } from '@/components/layout/panel-icons'
import { AseguradorasPage } from './aseguradoras'

function SectionHeading({ section }: { section: PanelSection }) {
  const { usuario } = usePanel()
  return (
    <div className="mb-8 max-w-3xl">
      <div className="mb-4 h-1 w-12 rounded-full bg-brand-accent" aria-hidden="true" />
      <h1 className="text-3xl font-bold tracking-tight text-primary">{sections[section].label}</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        {section === 'siniestros' && usuario.tipo === 'GESTOR'
          ? 'Tus casos asignados y toda la información para acompañarlos.'
          : sections[section].description}
      </p>
    </div>
  )
}

function Dashboard() {
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

const emptyContent = {
  siniestros: {
    title: 'Tu espacio para el seguimiento de casos',
    text: 'Los siniestros aparecerán aquí con su información y su estado.',
  },
  plantillas: {
    title: 'Los documentos que necesitás, a mano',
    text: 'Aquí podrás consultar las plantillas disponibles y descargarlas para trabajar en tus siniestros.',
  },
  ajustadores: {
    title: 'El equipo que acompaña los casos',
    text: 'Aquí encontrarás a los ajustadores y su información profesional.',
  },
  usuarios: {
    title: 'Las personas detrás del estudio',
    text: 'Aquí encontrarás a los integrantes del equipo, según los permisos de tu rol.',
  },
  informes: {
    title: 'Una perspectiva del trabajo realizado',
    text: 'Aquí podrás consultar los informes disponibles del estudio.',
  },
} satisfies Partial<Record<PanelSection, { title: string; text: string }>>

function ModuleSpace({ section }: { section: keyof typeof emptyContent }) {
  const { usuario } = usePanel()
  const Icon = sectionIcons[section]
  return (
    <>
      <SectionHeading section={section} />
      <section
        aria-label={sections[section].label}
        className="overflow-hidden rounded-xl border bg-card shadow-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-5 sm:px-8">
          <h2 className="font-semibold">
            {section === 'siniestros' && usuario.tipo === 'GESTOR'
              ? 'Mis siniestros'
              : section === 'plantillas'
                ? 'Documentos del estudio'
                : sections[section].label}
          </h2>
          {section === 'plantillas' && (
            <Badge variant="info">
              <ArrowDownToLine aria-hidden="true" />
              Solo descarga
            </Badge>
          )}
        </div>
        <div className="grid min-h-80 items-center gap-7 px-6 py-10 sm:px-10 sm:py-14 md:grid-cols-[auto_1fr]">
          <div
            className="relative grid size-24 place-items-center rounded-2xl border border-callout-line bg-callout-bg text-primary"
            aria-hidden="true"
          >
            <Icon className="size-12" strokeWidth={1.5} />
            <span className="absolute -right-2 bottom-4 h-1 w-8 rounded-full bg-brand-accent" />
          </div>
          <div className="max-w-xl">
            <h3 className="text-2xl font-semibold text-primary">{emptyContent[section].title}</h3>
            <p className="mt-3 text-muted-foreground">{emptyContent[section].text}</p>
            <p className="mt-5 text-sm text-muted-foreground">
              No hay datos para mostrar en esta vista previa.
            </p>
          </div>
        </div>
        {section === 'plantillas' && (
          <p className="flex items-start gap-3 border-t bg-muted px-6 py-5 text-sm text-muted-foreground sm:px-8">
            <LockKeyhole className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            Como gestor, podés consultar y descargar plantillas. La carga y la eliminación las
            administra el estudio.
          </p>
        )}
      </section>
    </>
  )
}

function Profile() {
  const { usuario } = usePanel()
  return (
    <>
      <SectionHeading section="perfil" />
      <section
        className="max-w-3xl overflow-hidden rounded-xl border bg-card shadow-card"
        aria-labelledby="profile-name"
      >
        <div className="flex flex-wrap items-center gap-5 border-b p-6 sm:p-8">
          <span className="grid size-20 shrink-0 place-items-center rounded-full bg-accent text-primary">
            <UserRound className="size-9" aria-hidden="true" />
          </span>
          <div>
            <h2 id="profile-name" className="text-2xl font-semibold text-primary">
              {usuario.nombre}
            </h2>
            <p className="mt-2 text-muted-foreground">{roleLabels[usuario.tipo]}</p>
          </div>
        </div>
        <div className="p-6 sm:p-8">
          <h3 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-6 text-primary" aria-hidden="true" />
            Tu espacio de trabajo
          </h3>
          <p className="mt-3 text-muted-foreground">
            {usuario.tipo === 'GESTOR'
              ? 'Seguimiento de tus siniestros asignados y consulta de plantillas para descargar.'
              : 'Acceso al dashboard, siniestros, aseguradoras, ajustadores, usuarios e informes.'}
          </p>
          <p className="mt-5 border-t pt-5 text-sm text-muted-foreground">
            El rol determina las secciones disponibles. Los cambios de permisos se realizan a través
            de la administración del estudio.
          </p>
        </div>
      </section>
    </>
  )
}

/** Punto de control común para enlaces, recargas y URLs ingresadas manualmente. */
export function PanelSectionPage() {
  const { '*': path = '' } = useParams()
  const { usuario, basePath } = usePanel()
  if (!canOpenSection(usuario.tipo, path)) {
    return (
      <section className="max-w-2xl rounded-xl border bg-card p-6 shadow-card sm:p-10">
        <LockKeyhole className="mb-5 size-10 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-primary">Esta sección no está disponible</h1>
        <p className="mt-3 mb-6 text-muted-foreground">
          La dirección no existe o no está habilitada para tu rol.
        </p>
        {initialSection(usuario.tipo) && (
          <Button asChild>
            <Link to={`${basePath}/${initialSection(usuario.tipo)}`}>
              Volver a mi espacio
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        )}
      </section>
    )
  }
  if (path === 'dashboard') return <Dashboard />
  if (path === 'perfil') return <Profile />
  if (path === 'aseguradoras') return <AseguradorasPage />
  return <ModuleSpace section={path} />
}
