import { useId, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type TextFieldProps = ComponentProps<typeof Input> & {
  label: string
  hint?: string
  error?: string
  containerClassName?: string
}

export function TextField({
  label,
  hint,
  error,
  id,
  required,
  containerClassName,
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
        {required && (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      <Input
        {...props}
        id={fieldId}
        required={required}
        aria-describedby={description}
        aria-invalid={error ? true : props['aria-invalid']}
      />
      {hint && (
        <p id={`${fieldId}-hint`} className="text-sm leading-6 text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fieldId}-error`} className="text-sm leading-6 text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
