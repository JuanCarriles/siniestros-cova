import { useState, type ComponentProps } from 'react'
import { flushSync } from 'react-dom'
import { TextField } from '@/components/text-field'
import { cn } from '@/lib/utils'

type PasswordFieldProps = Omit<ComponentProps<typeof TextField>, 'type' | 'accesorio'> & {
  /** Evita el autocompletado inicial de una confirmación; el foco automático no habilita la escritura. */
  entradaManual?: boolean
}

// Contraseña con botón "Mostrar": quien ve poco puede revisar lo que escribió antes de enviar.
// El botón dice con texto lo que va a hacer (no un ojito); al cambiar, cambia la palabra (no se usa aria-pressed,
// que con una etiqueta cambiante se anunciaría al revés). Ocupa todo el alto del campo: 48 px táctiles.
export function PasswordField({ className, entradaManual = false, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const [interaccion, setInteraccion] = useState(false)
  function habilitarEscritura() {
    if (entradaManual && !interaccion) {
      // Actualizar antes de la acción nativa conserva la primera tecla o el pegado.
      flushSync(() => setInteraccion(true))
    }
  }
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      readOnly={props.readOnly || (entradaManual && !interaccion)}
      onPointerDown={(event) => {
        habilitarEscritura()
        props.onPointerDown?.(event)
      }}
      onKeyDown={(event) => {
        if (
          event.key.length === 1 ||
          ['Backspace', 'Delete', 'Process', 'Unidentified'].includes(event.key)
        ) {
          habilitarEscritura()
        }
        props.onKeyDown?.(event)
      }}
      onPaste={(event) => {
        habilitarEscritura()
        props.onPaste?.(event)
      }}
      // Que el corrector y las mayúsculas automáticas del celular no alteren la contraseña visible
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      className={cn('pr-28', className)}
      accesorio={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="mr-px h-[calc(100%-2px)] min-w-24 rounded-r-md px-4 text-base font-semibold text-primary underline-offset-4 hover:bg-accent hover:underline focus-visible:outline-3 focus-visible:outline-offset-0 focus-visible:outline-ring"
        >
          {visible ? 'Ocultar' : 'Mostrar'}
          <span className="sr-only"> contraseña</span>
        </button>
      }
    />
  )
}
