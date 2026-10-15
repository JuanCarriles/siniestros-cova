import * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-12 w-full min-w-0 rounded-md border border-input bg-surface px-3 py-1 text-base transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-base file:font-semibold file:text-foreground placeholder:text-muted-foreground focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled-bg disabled:text-disabled-ink disabled:placeholder:text-disabled-ink',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20',
        // Con error, el borde además de rojo es más grueso: se nota aunque no se distinga el color
        'aria-invalid:border-2 aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
