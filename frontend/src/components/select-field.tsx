import { useId, type Ref } from 'react'
import { CircleAlert } from 'lucide-react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type OpcionSelect = { valor: string; etiqueta: string }

// Lista desplegable con etiqueta, ayuda y error, igual que TextField. Con react-hook-form se usa desde un
// Controller: ref va al botón, así el foco llega acá cuando el campo tiene un error.
export function SelectField({
  label,
  hint,
  error,
  required,
  disabled,
  placeholder,
  opciones,
  value,
  onChange,
  onBlur,
  name,
  ref,
  containerClassName,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  disabled?: boolean
  placeholder: string
  opciones: OpcionSelect[]
  /** '' muestra el placeholder */
  value: string
  onChange: (valor: string) => void
  onBlur?: () => void
  name?: string
  ref?: Ref<HTMLButtonElement>
  containerClassName?: string
}) {
  const id = useId()
  const descripcion =
    [hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className={cn('grid content-start gap-1.5', containerClassName)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="font-normal text-muted-foreground" aria-hidden="true">
            (obligatorio)
          </span>
        )}
      </Label>
      <Select
        name={name}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        required={required}
      >
        <SelectTrigger
          ref={ref}
          id={id}
          onBlur={onBlur}
          aria-required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={descripcion}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {opciones.map((opcion) => (
            <SelectItem key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
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
