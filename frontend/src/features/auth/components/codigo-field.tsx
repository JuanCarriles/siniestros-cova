import { useId, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// Un único input real permite pegar el código completo, autocompletar desde el correo y usar teclado.
// Los seis casilleros son su presentación visual; no obligan a tabular seis veces.
export function CodigoField({
  value,
  onChange,
  error,
  invalido = false,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  error?: string
  /** Código rechazado por el servidor: casilleros en rojo, aunque el mensaje esté en el aviso de arriba */
  invalido?: boolean
  disabled?: boolean
}) {
  const conError = !!error || invalido
  const id = useId()
  const [focus, setFocus] = useState(false)
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Código de verificación</Label>
      <div className="relative">
        <div className="grid grid-cols-6 gap-1.5 sm:gap-2" aria-hidden="true">
          {Array.from({ length: 6 }, (_, n) => (
            <span
              key={n}
              className={cn(
                'grid h-14 min-w-0 place-items-center rounded-md border-2 border-input bg-surface font-mono text-2xl font-semibold text-foreground',
                // Con error, además de rojo el borde es más grueso (se nota aunque no se distinga el color)
                conError && 'border-[3px] border-destructive',
                focus &&
                  Math.min(value.length, 5) === n &&
                  'border-ring outline-3 outline-offset-2 outline-ring',
              )}
            >
              {value[n] ?? ''}
            </span>
          ))}
        </div>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]{6}"
          value={value}
          disabled={disabled}
          required
          aria-invalid={conError}
          aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ''}`}
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onPaste={(e) => {
            e.preventDefault()
            onChange(e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6))
          }}
        />
      </div>
      <p id={`${id}-ayuda`} className="text-sm text-muted-foreground">
        Ingresá o pegá los 6 dígitos del correo.
      </p>
      {error && (
        <p
          id={`${id}-error`}
          className="flex items-start gap-1.5 text-sm font-semibold text-destructive"
        >
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}
