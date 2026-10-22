import { usePanel } from './panel-context'
import { sections, type PanelSection } from './panel-navigation'

// Título y descripción de cada sección del panel, con la marca naranja arriba. Una pantalla dentro de una sección
// (p. ej. los ajustadores de una aseguradora) puede reemplazar el título y la descripción.
export function SectionHeading({
  section,
  titulo,
  descripcion,
}: {
  section: PanelSection
  titulo?: string
  descripcion?: string
}) {
  const { usuario } = usePanel()
  return (
    <div className="mb-8 max-w-3xl">
      <div className="mb-4 h-1 w-12 rounded-full bg-brand-accent" aria-hidden="true" />
      <h1 className="text-3xl font-bold tracking-tight text-primary">
        {titulo ?? sections[section].label}
      </h1>
      <p className="mt-3 text-lg text-muted-foreground">
        {descripcion ??
          (section === 'siniestros' && usuario.tipo === 'GESTOR'
            ? 'Tus casos asignados y toda la información para acompañarlos.'
            : sections[section].description)}
      </p>
    </div>
  )
}
