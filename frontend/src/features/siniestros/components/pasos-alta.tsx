import { Check } from 'lucide-react'
import { PASOS_ALTA } from '@cova/shared/schemas/siniestros-alta'
import { cn } from '@/lib/utils'

// Dónde está el alta dentro de los cinco pasos del CU-09. El estado de cada paso se dice con ícono y con texto,
// no solo con el color. En el celular se lee "Paso 1 de 5: Datos del caso" y se ven solo los números.
export function PasosAlta({ actual }: { actual: number }) {
  return (
    <nav aria-label="Pasos del alta" className="mb-8">
      <p className="mb-3 text-lg font-semibold text-primary md:hidden">
        Paso {actual} de {PASOS_ALTA.length}: {PASOS_ALTA[actual - 1]}
      </p>
      <ol className="flex items-start md:grid md:grid-cols-5 md:gap-3">
        {PASOS_ALTA.map((paso, i) => {
          const numero = i + 1
          const estado = numero < actual ? 'hecho' : numero === actual ? 'actual' : 'pendiente'
          return (
            <li
              key={paso}
              aria-current={estado === 'actual' ? 'step' : undefined}
              className="relative flex flex-1 flex-col items-center gap-2 md:items-start"
            >
              {/* Línea hacia el paso siguiente: muestra el recorrido, sin información propia */}
              {numero < PASOS_ALTA.length && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-5 left-1/2 h-1 w-full rounded-full md:left-12 md:w-[calc(100%-2.25rem)]',
                    numero < actual ? 'bg-primary' : 'bg-line',
                  )}
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  'relative grid size-10 shrink-0 place-items-center rounded-full border-2 text-lg font-bold',
                  estado === 'hecho' && 'border-primary bg-primary text-primary-foreground',
                  estado === 'actual' &&
                    'border-primary bg-surface text-primary ring-4 ring-brand-accent/40',
                  estado === 'pendiente' && 'border-line-strong bg-surface text-ink-muted',
                )}
              >
                {estado === 'hecho' ? <Check className="size-5" strokeWidth={3} /> : numero}
              </span>
              <span
                className={cn(
                  'sr-only md:not-sr-only md:pr-2 md:leading-snug',
                  estado === 'actual' ? 'font-semibold text-primary' : 'text-muted-foreground',
                )}
              >
                {paso}
                <span className="sr-only">
                  {estado === 'hecho' ? ' (completo)' : estado === 'actual' ? ' (actual)' : ''}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
