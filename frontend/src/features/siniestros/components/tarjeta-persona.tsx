import type { ReactNode } from 'react'
import { Pencil, Trash2, UserPlus } from 'lucide-react'
import type { TipoLesion } from '@cova/shared/schemas/enums'
import { GRAVEDADES_LESION } from '@cova/shared/schemas/siniestros-alta'
import { Button } from '@/components/ui/button'

// Piezas compartidas del paso 2 del alta: la tarjeta de cada persona (titular, ocupante o fuera de los vehículos)
// y los botones para agregar y quitar.

type PersonaResumen = {
  documento?: string | null
  conLesiones: boolean
  tipoLesion?: TipoLesion | null
}

export function TarjetaPersona({
  nombre,
  persona,
  tipoDocumento,
  rol,
  situacion,
  onModificar,
  onQuitar,
}: {
  nombre: string
  persona: PersonaResumen
  tipoDocumento: string | undefined
  /** Etiqueta arriba del nombre: el rol de quien no iba en un vehículo */
  rol?: string
  /** Dónde iba en el vehículo */
  situacion?: string
  onModificar: (boton: HTMLElement) => void
  onQuitar: (boton: HTMLElement, nombre: string) => void
}) {
  return (
    <div className="grid content-start gap-2 rounded-lg border-2 border-line-strong bg-surface-subtle p-4">
      {rol && (
        <p className="w-fit rounded bg-neutral-bg px-2 text-sm font-bold tracking-wide text-neutral-ink uppercase">
          {rol}
        </p>
      )}
      <p className="text-lg font-bold">{nombre}</p>
      {persona.documento && (
        <p className="dato">{[tipoDocumento, persona.documento].filter(Boolean).join(' ')}</p>
      )}
      {situacion && <p>{situacion}</p>}
      {persona.conLesiones && persona.tipoLesion ? (
        <p className="w-fit rounded-md border-2 border-injury-border bg-injury-bg px-2 font-semibold text-injury-ink">
          Lesiones: {GRAVEDADES_LESION[persona.tipoLesion]}
        </p>
      ) : (
        <p className="text-muted-foreground">Sin lesiones</p>
      )}
      <div className="mt-1 flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={(e) => onModificar(e.currentTarget)}
          aria-label={`Modificar a ${nombre}`}
        >
          <Pencil aria-hidden="true" />
          Modificar
        </Button>
        <BotonQuitar
          etiqueta={`Quitar a ${nombre}`}
          onClick={(e) => onQuitar(e.currentTarget, nombre)}
        >
          Quitar
        </BotonQuitar>
      </div>
    </div>
  )
}

export function BotonPersona({
  onClick,
  children,
}: {
  onClick: (boton: HTMLElement) => void
  children: ReactNode
}) {
  return (
    <Button
      variant="outline"
      className="min-h-14 border-2 border-dashed border-primary/50"
      onClick={(e) => onClick(e.currentTarget)}
    >
      <UserPlus aria-hidden="true" />
      {children}
    </Button>
  )
}

export function BotonQuitar({
  etiqueta,
  onClick,
  cargando = false,
  children,
}: {
  etiqueta: string
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  /** Mientras se quita (p. ej. un documento en R2) */
  cargando?: boolean
  children: ReactNode
}) {
  return (
    <Button
      variant="ghost"
      className="text-danger-ink hover:bg-danger-bg hover:text-danger-ink"
      loading={cargando}
      onClick={onClick}
      aria-label={etiqueta}
    >
      <Trash2 aria-hidden="true" />
      {children}
    </Button>
  )
}
