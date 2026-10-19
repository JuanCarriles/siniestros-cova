import { useEffect, useRef, type ReactNode, type Ref } from 'react'
import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

// Aviso arriba de un formulario o una sección. El error se distingue por ícono, borde grueso y texto en negrita,
// no solo por el color. Puede recibir el foco (tabIndex -1): al moverlo ahí, con la pantalla ampliada el zoom
// va hasta el mensaje y el lector de pantalla lo lee.
export function Aviso({
  tipo,
  children,
  className,
  enfocar = false,
  ref,
}: {
  tipo: 'error' | 'info' | 'exito'
  children: ReactNode
  className?: string
  /** Mover el foco al aviso cuando aparece o cambia su texto (errores que devuelve el servidor) */
  enfocar?: boolean
  ref?: Ref<HTMLDivElement>
}) {
  const propio = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (enfocar) propio.current?.focus()
  }, [enfocar, children])

  const Icono = { error: CircleAlert, info: Info, exito: CircleCheck }[tipo]
  return (
    <div
      ref={(elemento) => {
        propio.current = elemento
        if (typeof ref === 'function') ref(elemento)
        else if (ref) ref.current = elemento
      }}
      tabIndex={-1}
      role={tipo === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-lg border-2 p-4 font-semibold focus-visible:outline-offset-2',
        {
          error: 'border-destructive bg-danger-bg text-danger-ink',
          info: 'border-info-ink bg-info-bg text-info-ink',
          exito: 'border-ok-ink bg-ok-bg text-ok-ink',
        }[tipo],
        className,
      )}
    >
      <Icono className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}
