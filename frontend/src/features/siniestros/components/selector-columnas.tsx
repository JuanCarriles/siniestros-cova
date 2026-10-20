import { Columns3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ColumnaSiniestros, IdColumna } from '../columnas'

// Elegir qué columnas ver. Siniestro y Asegurado no se pueden ocultar: identifican la fila.
export function SelectorColumnas({
  columnas,
  visible,
  alternar,
  mostrarTodas,
  cantidadOcultas,
}: {
  columnas: readonly ColumnaSiniestros[]
  visible: (id: IdColumna) => boolean
  alternar: (id: IdColumna) => void
  mostrarTodas: () => void
  cantidadOcultas: number
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="min-h-12">
          <Columns3 aria-hidden="true" />
          Columnas
          {cantidadOcultas > 0 && (
            <span className="text-muted-foreground">
              ({cantidadOcultas} oculta{cantidadOcultas === 1 ? '' : 's'})
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Columnas visibles</DropdownMenuLabel>
        {columnas.map((c) => {
          const nombre =
            'subtitulo' in c
              ? `${c.titulo} y ${c.subtitulo.toLowerCase()}`
              : 'tituloCompleto' in c
                ? c.tituloCompleto
                : c.titulo
          return 'fija' in c ? (
            <DropdownMenuCheckboxItem key={c.id} checked disabled>
              {nombre} <span className="text-sm text-muted-foreground">(siempre)</span>
            </DropdownMenuCheckboxItem>
          ) : (
            <DropdownMenuCheckboxItem
              key={c.id}
              checked={visible(c.id)}
              onSelect={() => alternar(c.id)}
            >
              {nombre}
            </DropdownMenuCheckboxItem>
          )
        })}
        {cantidadOcultas > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={mostrarTodas}>Mostrar todas</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
