import type { TipoUsuario } from '@cova/shared/schemas/enums'
import { motivoRestriccionUsuario } from '@cova/shared/schemas/usuarios-abm'
import { roleLabels } from '@/components/layout/panel-navigation'
import { cn } from '@/lib/utils'

const tipos = [
  { tipo: 'GESTOR', descripcion: 'Gestiona sus casos asignados.' },
  {
    tipo: 'ADMINISTRADOR',
    descripcion: 'Administra casos y gestores.',
  },
] as const

export function TipoUsuarioSelector({
  rol,
  valor,
  onCambio,
  error,
  modo = 'alta',
}: {
  rol: TipoUsuario
  valor: TipoUsuario
  onCambio: (tipo: TipoUsuario) => void
  error?: string
  modo?: 'alta' | 'edicion'
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 font-semibold">
        Tipo de usuario <span className="font-normal text-muted-foreground">(obligatorio)</span>
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {tipos.map(({ tipo, descripcion }) => {
          const motivo = motivoRestriccionUsuario(rol, tipo, modo === 'alta' ? 'crear' : 'asignar')
          const permitido = motivo === null
          return (
            <label
              key={tipo}
              className={cn(
                'relative grid content-start gap-1.5 rounded-lg border-2 p-3 transition-colors focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-ring',
                !permitido
                  ? 'cursor-not-allowed border-border bg-muted text-muted-foreground'
                  : 'cursor-pointer border-input hover:bg-accent',
                valor === tipo && permitido && 'border-primary bg-accent',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold">{roleLabels[tipo]}</span>
                <input
                  type="radio"
                  name="tipoUsuario"
                  value={tipo}
                  checked={valor === tipo}
                  disabled={!permitido}
                  onChange={() => onCambio(tipo)}
                  aria-describedby={`tipo-${tipo}-ayuda`}
                  className="size-5 accent-primary"
                />
              </div>
              <span id={`tipo-${tipo}-ayuda`} className="text-base leading-snug">
                {motivo ?? descripcion}
              </span>
            </label>
          )
        })}
      </div>
      {error && (
        <p role="alert" className="font-semibold text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}
