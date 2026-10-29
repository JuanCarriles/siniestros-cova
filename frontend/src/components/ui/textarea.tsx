import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-24 w-full min-w-0 resize-y rounded-md border border-input bg-surface px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-ink aria-invalid:border-2 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}
