import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { LoaderCircle } from 'lucide-react'
import { Slot } from 'radix-ui'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-base font-semibold whitespace-normal text-center transition-colors focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-navy-hover active:bg-navy-active',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-danger-hover focus-visible:ring-destructive/20',
        outline:
          'border border-input bg-surface shadow-card hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-12 px-4 py-2',
        sm: 'min-h-12 gap-2 rounded-md px-3 py-2 text-base',
        lg: 'min-h-14 rounded-md px-6 py-3 has-[>svg]:px-4',
        icon: 'size-12',
        'icon-sm': 'size-12',
        'icon-lg': 'size-14',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  loading = false,
  disabled,
  children,
  type,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean
  } & ({ asChild: true; disabled?: never; loading?: never } | { asChild?: false })) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
      type={asChild ? undefined : (type ?? 'button')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-disabled={disabled || loading || undefined}
      onClick={(event) => {
        if (disabled || loading) {
          event.preventDefault()
          return
        }
        props.onClick?.(event)
      }}
    >
      {loading && !asChild ? (
        <>
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  )
}

export { Button }
