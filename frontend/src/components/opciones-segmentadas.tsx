import type { ReactNode, Ref } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type OpcionSegmentada<T extends string> = { valor: T; etiqueta: ReactNode }

// Un solo control dividido en partes, con una siempre marcada (Asegurado / Tercero, Sí / No). Son botones de
// opción nativos: las flechas cambian de una a otra y el lector de pantalla anuncia "1 de 2". La elegida se
// distingue por el relleno, el tilde y la negrita, no solo por el color.
export function OpcionesSegmentadas<T extends string>({
  leyenda,
  name,
  opciones,
  valor,
  onCambio,
  refMarcada,
  columnas = 'grid-cols-2',
}: {
  leyenda: string
  name: string
  opciones: OpcionSegmentada<T>[]
  valor: T
  onCambio: (valor: T) => void
  /** Recibe el botón de la opción marcada (para llevarle el foco al abrir un formulario) */
  refMarcada?: Ref<HTMLInputElement>
  /** Clases de columnas: con más de dos opciones conviene que bajen de renglón en el celular */
  columnas?: string
}) {
  return (
    <fieldset className="grid content-start gap-2">
      <legend className="mb-2 font-semibold">{leyenda}</legend>
      <div className={cn('grid gap-1 rounded-xl border-2 border-primary bg-surface p-1', columnas)}>
        {opciones.map((opcion) => {
          const elegida = valor === opcion.valor
          return (
            <label
              key={opcion.valor}
              className={cn(
                'flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-center text-lg transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                elegida
                  ? 'bg-primary font-bold text-primary-foreground'
                  : 'font-semibold text-primary hover:bg-accent',
              )}
            >
              <input
                type="radio"
                name={name}
                value={opcion.valor}
                checked={elegida}
                onChange={() => onCambio(opcion.valor)}
                ref={elegida ? refMarcada : undefined}
                className="sr-only"
              />
              {elegida && <Check className="size-6 shrink-0" strokeWidth={3} aria-hidden="true" />}
              {opcion.etiqueta}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
