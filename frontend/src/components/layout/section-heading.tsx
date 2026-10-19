import { usePanel } from './panel-context'
import { sections, type PanelSection } from './panel-navigation'

// Título y descripción de cada sección del panel, con la marca naranja arriba.
export function SectionHeading({ section }: { section: PanelSection }) {
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
