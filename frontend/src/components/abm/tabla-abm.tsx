import type { Key, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MenuAcciones, type AccionFila } from './menu-acciones'

export type ColumnaAbm<T> = {
  id: string
  /** Texto del encabezado (en la tarjeta de celular, la etiqueta del dato) */
  encabezado: string
  /** Lo que el lector de pantalla agrega al encabezado, p. ej. " activos" */
  encabezadoLector?: string
  celda: (fila: T) => ReactNode
  alinear?: 'derecha'
  /** Columna que identifica la fila: va en negrita y es el título de la tarjeta en celular */
  principal?: boolean
}

// Listado de un ABM. Desde 768 px (md) es una tabla; más angosto, una tarjeta por fila con el dato principal
// de título, el resto como "etiqueta: valor" y el menú ⋮ arriba a la derecha (RNF-02: sin desplazarse de costado).
export function TablaAbm<T>({
  filas,
  columnas,
  clave,
  nombre,
  acciones,
  etiqueta,
  vacio,
}: {
  filas: T[]
  columnas: ColumnaAbm<T>[]
  clave: (fila: T) => Key
  /** Nombre de la fila para el menú ("Acciones de Andina Seguros") */
  nombre: (fila: T) => string
  acciones?: (fila: T) => AccionFila[]
  /** Nombre del listado para el lector de pantalla, p. ej. "Listado de aseguradoras" */
  etiqueta: string
  /** Qué mostrar si no hay filas */
  vacio: ReactNode
}) {
  if (filas.length === 0) return <div className="px-6 py-12 text-center">{vacio}</div>
  const principal = columnas.find((c) => c.principal) ?? columnas[0]
  const resto = columnas.filter((c) => c !== principal)

  return (
    <>
      <div className="hidden md:block">
        <Table containerLabel={etiqueta}>
          <TableHeader>
            <TableRow>
              {columnas.map((c) => (
                <TableHead
                  key={c.id}
                  scope="col"
                  className={cn(c.alinear === 'derecha' && 'text-right')}
                >
                  {c.encabezado}
                  {c.encabezadoLector && <span className="sr-only">{c.encabezadoLector}</span>}
                </TableHead>
              ))}
              {acciones && (
                <TableHead scope="col" className="w-px">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((fila) => (
              <TableRow key={clave(fila)}>
                {columnas.map((c) => (
                  <TableCell
                    key={c.id}
                    className={cn(
                      c.alinear === 'derecha' && 'text-right',
                      c.principal && 'font-semibold',
                    )}
                  >
                    {c.celda(fila)}
                  </TableCell>
                ))}
                {acciones && (
                  <TableCell className="w-px py-2 text-right">
                    <MenuAcciones nombre={nombre(fila)} acciones={acciones(fila)} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-line md:hidden" aria-label={etiqueta}>
        {filas.map((fila) => (
          <li key={clave(fila)} className="px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <p className="pt-2.5 text-lg font-semibold">{principal?.celda(fila)}</p>
              {acciones && <MenuAcciones nombre={nombre(fila)} acciones={acciones(fila)} />}
            </div>
            <dl className="mt-2 grid gap-2">
              {resto.map((c) => (
                <div key={c.id} className="flex flex-wrap items-baseline gap-x-2">
                  <dt className="text-muted-foreground">{c.encabezado}:</dt>
                  <dd>{c.celda(fila)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}
