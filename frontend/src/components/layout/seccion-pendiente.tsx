import { ArrowDownToLine, LockKeyhole } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { usePanel } from './panel-context'
import { sectionIcons } from './panel-icons'
import { sections, type PanelSection } from './panel-navigation'
import { SectionHeading } from './section-heading'

// Contenido provisorio de cada sección del panel. Cada historia lo reemplaza en app/router.tsx por la página
// real de su feature (features/<modulo>/pages).
const emptyContent = {
  siniestros: {
    title: 'Tu espacio para el seguimiento de casos',
    text: 'Los siniestros aparecerán aquí con su información y su estado.',
  },
  plantillas: {
    title: 'Los documentos que necesitás, a mano',
    text: 'Aquí podrás consultar las plantillas disponibles y descargarlas para trabajar en tus siniestros.',
  },
  aseguradoras: {
    title: 'Un lugar para cada compañía',
    text: 'Aquí encontrarás las aseguradoras y su información de contacto.',
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

export function SeccionPendiente({ section }: { section: keyof typeof emptyContent }) {
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
          {section === 'plantillas' && usuario.tipo === 'GESTOR' && (
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
              Esta sección todavía está en construcción.
            </p>
          </div>
        </div>
        {section === 'plantillas' && usuario.tipo === 'GESTOR' && (
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
