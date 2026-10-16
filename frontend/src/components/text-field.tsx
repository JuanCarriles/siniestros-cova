import { useId, type ComponentProps, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type TextFieldProps = ComponentProps<typeof Input> & {
  label: string
  hint?: string
  error?: string
  containerClassName?: string
  /** Control dentro del campo, a la derecha (p. ej. "Mostrar" en una contraseña). El input debe dejarle lugar con pr-*. */
  accesorio?: ReactNode
}

export function TextField({
  label,
  hint,
  error,
  id,
  required,
  containerClassName,
  accesorio,
  ...props
}: TextFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const description =
    [
      props['aria-describedby'],
      hint ? `${fieldId}-hint` : undefined,
      error ? `${fieldId}-error` : undefined,
    ]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className={cn('grid gap-1.5', containerClassName)}>
      <Label htmlFor={fieldId}>
        {label}
        {/* En palabras, no con un asterisco rojo: se lee aunque no se distinga el color. El lector de pantalla
            ya lo anuncia por el atributo required. */}
        {required && (
          <span className="font-normal text-muted-foreground" aria-hidden="true">
            (obligatorio)
          </span>
        )}
      </Label>
      <div className="relative">
        <Input
          {...props}
          id={fieldId}
          required={required}
          aria-describedby={description}
          aria-invalid={error ? true : props['aria-invalid']}
        />
        {accesorio && (
          <div className="absolute inset-y-0 right-0 flex items-center">{accesorio}</div>
        )}
      </div>
      {hint && (
        <p id={`${fieldId}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${fieldId}-error`}
          className="flex items-start gap-1.5 text-sm font-semibold text-destructive"
        >
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}
