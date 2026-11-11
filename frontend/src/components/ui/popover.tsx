import type { ComponentProps } from 'react'
import { Popover as Primitive } from 'radix-ui'
import { cn } from '@/lib/utils'

export const Popover = Primitive.Root
export const PopoverTrigger = Primitive.Trigger
export function PopoverContent({
  className,
  align = 'end',
  sideOffset = 12,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-[calc(100vw-2rem)] max-w-[32rem] overflow-hidden rounded-xl border-2 border-line-strong bg-surface text-foreground shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  )
}
