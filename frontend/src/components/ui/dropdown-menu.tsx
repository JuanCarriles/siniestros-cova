import * as React from 'react'
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// Menú desplegable (Radix): se abre con clic, Enter o Espacio; se recorre con las flechas y se cierra con Escape,
// devolviendo el foco al botón que lo abrió. Opciones de 48 px de alto y texto de 18 px.

function DropdownMenu(props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger(props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-56 overflow-hidden rounded-lg border border-line-strong bg-popover p-1.5 text-popover-foreground shadow-pop',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  peligro = false,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  /** Acción que da de baja o borra: en rojo, además de su texto e ícono */
  peligro?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        'flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-base font-medium outline-none select-none',
        'focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:text-disabled-ink',
        '[&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
        peligro && 'text-destructive focus:bg-danger-bg focus:text-danger-ink',
        className,
      )}
      {...props}
    />
  )
}

// Opción que se marca y desmarca (p. ej. columnas visibles). El menú queda abierto para elegir varias: la casilla
// se dibuja con borde y tilde, no solo con color.
function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  onSelect,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      checked={checked}
      onSelect={(event) => {
        event.preventDefault()
        onSelect?.(event)
      }}
      className={cn(
        'flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-base font-medium outline-none select-none',
        'focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:text-disabled-ink',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="grid size-6 shrink-0 place-items-center rounded border-2 border-input bg-surface text-primary-foreground in-data-[state=checked]:border-primary in-data-[state=checked]:bg-primary"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-4" strokeWidth={3} />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn('px-3 pt-2 pb-1 text-sm font-semibold text-muted-foreground', className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1.5 my-1.5 h-px bg-line', className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
}
