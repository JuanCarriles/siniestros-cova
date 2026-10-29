import { useId, type ComponentProps } from 'react'
import { CircleAlert } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// Texto largo con etiqueta, ayuda y error, igual que TextField. Mismo borde, foco y estado de error que Input.
export function TextareaField({
  label,
  hint,
  error,
  id,
  required,
  containerClassName,
  className,
  ...props
}: ComponentProps<'textarea'> & {
  label: string
  hint?: string
  error?: string
  containerClassName?: string
}) {
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
    <div className={cn('grid content-start gap-1.5', containerClassName)}>
      <Label htmlFor={fieldId}>
        {label}
        {required && (
          <span className="font-normal text-muted-foreground" aria-hidden="true">
            (obligatorio)
          </span>
        )}
      </Label>
      <textarea
        {...props}
        id={fieldId}
        required={required}
        aria-describedby={description}
        aria-invalid={error ? true : props['aria-invalid']}
        className={cn(
          'min-h-28 w-full min-w-0 rounded-md border border-input bg-surface px-3 py-2.5 text-base leading-relaxed transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled-bg disabled:text-disabled-ink',
          'aria-invalid:border-2 aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          className,
        )}
      />
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
