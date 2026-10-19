import { Check, Circle } from 'lucide-react'
import { reglasContrasena } from '@cova/shared/schemas/auth'
import { cn } from '@/lib/utils'

// Reglas de una contraseña nueva (mockup de CU-01, paso 3), marcadas a medida que se cumplen. Lo cumplido se
// distingue por ícono y texto para el lector de pantalla, no solo por el color. Las reglas salen del mismo lugar
// que la validación (@cova/shared), así que la lista y el error nunca dicen cosas distintas.
export function ReglasContrasena({ id, valor }: { id: string; valor: string }) {
  return (
    <ul id={id} className="grid gap-1.5" aria-label="La contraseña necesita">
      {reglasContrasena.map((regla) => {
        const cumple = regla.cumple(valor)
        const Icono = cumple ? Check : Circle
        return (
          <li
            key={regla.texto}
            className={cn(
              'flex items-center gap-2',
              cumple ? 'text-ok-ink' : 'text-muted-foreground',
            )}
          >
            <Icono className={cn('shrink-0', cumple ? 'size-5' : 'size-3.5')} aria-hidden="true" />
            {regla.texto}
            <span className="sr-only">{cumple ? ': cumplida' : ': falta'}</span>
          </li>
        )
      })}
    </ul>
  )
}
