import { useState, type ComponentProps } from 'react'
import { TextField } from '@/components/text-field'
import { cn } from '@/lib/utils'

type PasswordFieldProps = Omit<ComponentProps<typeof TextField>, 'type' | 'accesorio'>

// Contraseña con botón "Mostrar": quien ve poco puede revisar lo que escribió antes de enviar.
// El botón dice con texto lo que va a hacer (no un ojito); al cambiar, cambia la palabra (no se usa aria-pressed,
// que con una etiqueta cambiante se anunciaría al revés). Ocupa todo el alto del campo: 48 px táctiles.
export function PasswordField({ className, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
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
