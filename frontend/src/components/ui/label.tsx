import * as React from 'react'
import { cn } from '@/lib/utils'
import { Label as LabelPrimitive } from 'radix-ui'

// Etiqueta de 16 px en semibold. Deshabilitada cambia de color (no se vuelve transparente): sigue legible.
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex flex-wrap items-center gap-x-1.5 text-sm font-semibold text-ink-2 select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-disabled-ink peer-disabled:cursor-not-allowed peer-disabled:text-disabled-ink',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
