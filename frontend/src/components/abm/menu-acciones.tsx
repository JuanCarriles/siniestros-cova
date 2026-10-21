import { useRef, type ReactNode } from 'react'
import { EllipsisVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type AccionFila = {
  etiqueta: string
  icono: ReactNode
  /** Recibe el botón ⋮: si la acción abre un diálogo, al cerrarlo el foco vuelve ahí (ver elementoAlCerrar) */
  onSelect: (disparador: HTMLButtonElement | null) => void
  /** Baja o borrado: va en rojo, separada de las demás */
  peligro?: boolean
  /** Todavía no disponible: se ve (para saber que existirá) pero no se puede elegir */
  proximamente?: boolean
}

// Menú ⋮ de cada fila (mockups). El botón mide 48 px y dice para el lector de pantalla de qué fila es
// ("Acciones de Andina Seguros"); las opciones tienen ícono y texto.
export function MenuAcciones({ nombre, acciones }: { nombre: string; acciones: AccionFila[] }) {
  const comunes = acciones.filter((a) => !a.peligro)
  const peligrosas = acciones.filter((a) => a.peligro)
  const disparador = useRef<HTMLButtonElement>(null)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={disparador}
          variant="ghost"
          size="icon"
          aria-label={`Acciones de ${nombre}`}
          className="border border-transparent text-ink-2 hover:border-input data-[state=open]:border-input data-[state=open]:bg-accent"
        >
          <EllipsisVertical className="size-6" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {comunes.map((accion) => (
          <DropdownMenuItem
            key={accion.etiqueta}
            disabled={accion.proximamente}
            onSelect={() => accion.onSelect(disparador.current)}
          >
            {accion.icono}
            <Etiqueta accion={accion} />
          </DropdownMenuItem>
        ))}
        {comunes.length > 0 && peligrosas.length > 0 && <DropdownMenuSeparator />}
        {peligrosas.map((accion) => (
          <DropdownMenuItem
            key={accion.etiqueta}
            peligro
            disabled={accion.proximamente}
            onSelect={() => accion.onSelect(disparador.current)}
          >
            {accion.icono}
            <Etiqueta accion={accion} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Etiqueta({ accion }: { accion: AccionFila }) {
  return (
    <span>
      {accion.etiqueta}
      {accion.proximamente && <span className="ml-1.5 text-sm font-normal">(próximamente)</span>}
    </span>
  )
}
