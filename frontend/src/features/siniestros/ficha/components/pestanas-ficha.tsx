import { useId } from 'react'
import { NavLink, useLocation, useResolvedPath } from 'react-router'
import {
  Car,
  ClipboardList,
  FileStack,
  FolderOpen,
  Gavel,
  History,
  Megaphone,
  MessagesSquare,
  type LucideIcon,
} from 'lucide-react'
import type { FichaSiniestro } from '@cova/shared/schemas/ficha-siniestro'
import { cn } from '@/lib/utils'

type Pestana = {
  /** Cada pestaña es una dirección propia dentro de la ficha (/siniestros/12/vehiculos) */
  ruta: string
  titulo: string
  icono: LucideIcon
  cantidad?: keyof FichaSiniestro['cantidades']
}

// Dos grupos: lo que es el caso y lo que va pasando con él
const GRUPOS: { titulo: string; pestanas: Pestana[] }[] = [
  {
    titulo: 'El caso',
    pestanas: [
      { ruta: '', titulo: 'Datos del caso', icono: FolderOpen },
      { ruta: 'vehiculos', titulo: 'Vehículos y partes', icono: Car, cantidad: 'vehiculosYPartes' },
      { ruta: 'abogados', titulo: 'Abogados', icono: Gavel, cantidad: 'abogados' },
      { ruta: 'peritos', titulo: 'Peritos', icono: ClipboardList, cantidad: 'peritos' },
    ],
  },
  {
    titulo: 'Seguimiento',
    pestanas: [
      { ruta: 'novedades', titulo: 'Novedades', icono: Megaphone, cantidad: 'novedades' },
      { ruta: 'documentos', titulo: 'Documentos', icono: FileStack, cantidad: 'documentos' },
      { ruta: 'chat', titulo: 'Chat con el gestor', icono: MessagesSquare },
      { ruta: 'historial', titulo: 'Historial', icono: History },
    ],
  },
]

// Secciones de la ficha (CU-10 paso 1), en un panel propio debajo de la cabecera. Son enlaces: la dirección recuerda
// la pestaña y "atrás" vuelve a la anterior. Se acomoda al ancho de la ficha: con lugar, cada grupo es una fila con
// su nombre a la izquierda; si no, el nombre va arriba y las pestañas en cuatro o dos columnas parejas. Siempre
// todas a la vista: nada queda escondido en un desplazamiento lateral.
export function PestanasFicha({
  ficha,
  esGestor,
  estado,
}: {
  ficha: FichaSiniestro
  esGestor: boolean
  /** Viaja con cada pestaña (para "Volver al listado") */
  estado: unknown
}) {
  const id = useId()
  const location = useLocation()
  const base = useResolvedPath('.').pathname.replace(/\/$/, '')
  const actual = location.pathname.replace(/\/$/, '')

  return (
    <nav
      aria-label="Secciones del siniestro"
      className="@container mb-6 overflow-hidden rounded-2xl border bg-card shadow-card"
    >
      {GRUPOS.map((grupo, i) => (
        <div
          key={grupo.titulo}
          className={cn(
            'grid gap-2 p-3 @6xl:grid-cols-[8.5rem_1fr] @6xl:items-center @6xl:gap-3 @6xl:px-4',
            i > 0 && 'border-t-2 border-line',
            // El seguimiento, sobre un fondo apenas distinto: se ve que son dos bloques
            i > 0 && 'bg-surface-subtle',
          )}
        >
          <p
            id={`${id}-${i}`}
            className="px-1 text-sm font-bold tracking-wide text-muted-foreground uppercase"
          >
            {grupo.titulo}
          </p>
          <ul
            aria-labelledby={`${id}-${i}`}
            className="grid grid-cols-2 gap-2 @2xl:grid-cols-4 @6xl:flex @6xl:flex-wrap @6xl:gap-1.5"
          >
            {grupo.pestanas.map((p) => {
              const Icono = p.icono
              const cantidad = p.cantidad ? ficha.cantidades[p.cantidad] : null
              const destino = p.ruta ? `${base}/${p.ruta}` : base
              return (
                <li key={p.ruta} className="flex">
                  <NavLink
                    to={p.ruta}
                    end
                    preventScrollReset
                    // Abrir la pestaña que ya está abierta reemplaza la entrada del historial: conserva su estado
                    state={actual === destino ? (location.state as unknown) : estado}
                    className={({ isActive }) =>
                      cn(
                        'min-h-12 w-full rounded-xl border-2 px-3 py-2 text-base leading-tight transition-colors',
                        // Celular: el ícono y la cantidad arriba, el nombre abajo con todo el ancho (no se corta).
                        // Con más lugar, todo en una línea.
                        'grid grid-cols-[1fr_auto] items-center gap-x-2.5 gap-y-1.5',
                        '@2xl:grid-cols-[auto_1fr_auto] @6xl:flex @6xl:w-auto',
                        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
                        isActive
                          ? 'border-navy bg-navy font-bold text-on-navy shadow-card'
                          : // En grilla, cada pestaña se ve como un botón; en fila, solo al pasar el mouse
                            'border-line bg-card font-semibold text-foreground hover:border-line-strong hover:bg-accent @6xl:border-transparent @6xl:bg-transparent',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icono
                          className={cn(
                            'col-start-1 row-start-1 size-5 shrink-0',
                            isActive ? 'text-on-navy' : 'text-primary',
                          )}
                          aria-hidden="true"
                        />
                        <span className="col-span-2 row-start-2 min-w-0 @2xl:col-span-1 @2xl:col-start-2 @2xl:row-start-1">
                          {p.ruta === 'chat' && esGestor ? 'Chat' : p.titulo}
                        </span>
                        {cantidad !== null && (
                          <span
                            className={cn(
                              'col-start-2 row-start-1 min-w-7 shrink-0 justify-self-end rounded-md px-1.5 text-center dato text-sm font-bold @2xl:col-start-3',
                              isActive ? 'bg-on-navy text-navy' : 'bg-neutral-bg text-neutral-ink',
                            )}
                          >
                            <span className="sr-only">(</span>
                            {cantidad}
                            <span className="sr-only">)</span>
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
