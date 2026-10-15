import type { ComponentProps } from 'react'
import { Badge } from '@/components/ui/badge'
import { tonoDeEstado } from '@/lib/estados-visuales'

type EstadoChipProps = Omit<ComponentProps<typeof Badge>, 'children' | 'variant' | 'asChild'> & {
  estado?: string | null
}

export function EstadoChip({ estado, ...props }: EstadoChipProps) {
  const nombre = estado?.trim() || 'Sin estado'
  return (
    <Badge variant={tonoDeEstado(nombre)} {...props}>
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-current" />
      {nombre}
    </Badge>
  )
}
