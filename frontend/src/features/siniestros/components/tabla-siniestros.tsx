import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowDown } from 'lucide-react'
import type { OrdenSiniestros, SiniestroListado } from '@cova/shared/schemas/siniestros'
import { MenuAcciones, type AccionFila } from '@/components/abm/menu-acciones'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { ColumnaSiniestros, IdColumna } from '../columnas'
import {
  CeldaAbogado,
  CeldaAsegurado,
  CeldaAseguradora,
  CeldaEstado,
  CeldaGestor,
  CeldaPericias,
  CeldaSiniestro,
  CeldaTerceros,
  DiasSinMovimiento,
  type AlVer,
} from './celdas-siniestro'

// Ancho mínimo de la primera columna fija. La segunda se pega a su derecha según el ancho medido (puede crecer con
// números o pólizas largos): si se supusiera fijo, al desplazar de costado una taparía a la otra.
const ANCHO_PRIMERA = 'min-w-32'

// Tabla densa de siniestros (desde 768 px; en celular son tarjetas). Está pensada para entrar completa en una
// pantalla de escritorio. Si aun así no entra (tablet, zoom, muchas columnas), se desplaza dentro de su propio
// recuadro: Siniestro y Asegurado quedan fijos a la izquierda y el encabezado fijo arriba. Mientras entra, el
// encabezado se pega al borde de la pantalla al bajar, sin un desplazamiento adicional.
export function TablaSiniestros({
  siniestros,
  columnas,
  orden,
  hrefOrden,
  hrefSiniestro,
  onVer,
  acciones,
  avisoDesborde,
}: {
  siniestros: SiniestroListado[]
  /** Columnas visibles, en orden */
  columnas: readonly ColumnaSiniestros[]
  orden: OrdenSiniestros
  /** Dirección del listado con otro orden (encabezados que ordenan) */
  hrefOrden: (orden: OrdenSiniestros) => string
  hrefSiniestro: (id: number) => string
  onVer: AlVer
  /** Acciones del menú ⋮ de cada fila (última columna, siempre visible) */
  acciones: (siniestro: SiniestroListado) => AccionFila[]
  /** Qué hacer si no entra (achicar el menú, ocultar columnas): se muestra solo en ese caso */
  avisoDesborde?: ReactNode
}) {
  const contenedor = useRef<HTMLDivElement>(null)
  const tabla = useRef<HTMLTableElement>(null)
  const [desborda, setDesborda] = useState(false)
  const [anchoPrimera, setAnchoPrimera] = useState(0)
  useEffect(() => {
    const caja = contenedor.current
    const tablaActual = tabla.current
    if (!caja || !tablaActual) return
    // Se compara el ancho mínimo de la tabla (cada columna lo más angosta posible) con el lugar disponible. Se
    // mide forzando un ancho mínimo un instante: así el resultado no depende del modo en que está ahora.
    const medir = () => {
      const anterior = tablaActual.style.width
      tablaActual.style.width = '1px'
      const minimo = tablaActual.scrollWidth
      tablaActual.style.width = anterior
      setDesborda(minimo > caja.clientWidth + 1)
      setAnchoPrimera(tablaActual.querySelector('thead th')?.getBoundingClientRect().width ?? 0)
    }
    const observador = new ResizeObserver(medir)
    observador.observe(caja)
    observador.observe(tablaActual)
    return () => observador.disconnect()
  }, [])

  const fija = (id: IdColumna, encabezado = false) =>
    desborda && (id === 'siniestro' || id === 'asegurado')
      ? cn(
          'sticky',
          encabezado ? 'z-30' : 'z-10 bg-inherit',
          id === 'siniestro' ? 'left-0' : 'left-(--ancho-primera)',
          // Una línea marca dónde termina la parte fija
          id === 'asegurado' && 'shadow-[inset_-2px_0_0_var(--color-line-strong)]',
        )
      : undefined

  const celda: Record<IdColumna, (s: SiniestroListado) => ReactNode> = {
    siniestro: (s) => <CeldaSiniestro siniestro={s} href={hrefSiniestro(s.id)} />,
    asegurado: (s) => <CeldaAsegurado siniestro={s} />,
    terceros: (s) => <CeldaTerceros siniestro={s} onVer={onVer} />,
    aseguradora: (s) => <CeldaAseguradora siniestro={s} onVer={onVer} />,
    gestor: (s) => <CeldaGestor siniestro={s} />,
    estado: (s) => <CeldaEstado siniestro={s} />,
    pericias: (s) => <CeldaPericias siniestro={s} onVer={onVer} />,
    abogado: (s) => <CeldaAbogado siniestro={s} onVer={onVer} />,
    dias: (s) => <DiasSinMovimiento dias={s.diasSinMovimiento} cerrado={s.estado.esCierre} />,
  }

  // Encabezados que ordenan: un enlace que cambia ?orden= (también se elige desde "Ordenar" en la barra)
  const ordena: Partial<Record<IdColumna, OrdenSiniestros>> = {
    gestor: 'asignacion',
    dias: 'demora',
  }
  const encabezado = (c: ColumnaSiniestros) => {
    const texto = (
      <>
        <span className="block">{c.titulo}</span>
        {'subtitulo' in c && (
          <span className="block text-sm font-semibold text-ink-2 normal-case">{c.subtitulo}</span>
        )}
      </>
    )
    const porEsta = ordena[c.id]
    if (!porEsta) return texto
    const activo = orden === porEsta
    return (
      <Link
        to={hrefOrden(porEsta)}
        replace
        preventScrollReset
        className="inline-flex items-center gap-1.5 rounded underline-offset-4 hover:underline focus-visible:outline-offset-2"
        title={
          activo
            ? undefined
            : porEsta === 'demora'
              ? 'Ver primero los más demorados'
              : 'Ver primero los asignados más recientemente'
        }
      >
        <span>{texto}</span>
        <ArrowDown
          className={cn('size-4 shrink-0', activo ? 'opacity-100' : 'opacity-35')}
          aria-hidden="true"
        />
        <span className="sr-only">
          {activo ? ' (ordenado por esta columna)' : ' (ordenar por esta columna)'}
        </span>
      </Link>
    )
  }

  return (
    <>
      {desborda && avisoDesborde}
      <div
        ref={contenedor}
        role={desborda ? 'region' : undefined}
        aria-label={desborda ? 'Listado de siniestros (se desplaza)' : undefined}
        tabIndex={desborda ? 0 : undefined}
        className={cn(
          'relative w-full',
          desborda && 'max-h-[max(28rem,calc(100dvh-7rem))] overflow-auto overscroll-x-contain',
        )}
      >
        {/* Si se desplaza igual, cada dato va en su ancho natural (sin cortar palabras); si entra, ocupa el ancho */}
        <table
          ref={tabla}
          style={{ '--ancho-primera': `${anchoPrimera}px` } as CSSProperties}
          className={cn(
            'border-separate border-spacing-0 text-base',
            desborda ? 'w-max min-w-full' : 'w-full',
          )}
        >
          <caption className="sr-only">Listado de siniestros</caption>
          <TableHeader className="[&_tr]:border-0">
            <TableRow>
              {columnas.map((c) => (
                <TableHead
                  key={c.id}
                  scope="col"
                  aria-sort={
                    ordena[c.id] ? (orden === ordena[c.id] ? 'descending' : 'none') : undefined
                  }
                  className={cn(
                    // Fijo arriba: la línea gruesa va como sombra porque el borde de la fila no acompaña al pegarse
                    // Sin espaciado extra entre letras: en esta tabla los títulos marcan el ancho de varias columnas
                    'sticky top-0 z-20 px-2.5 py-3 align-bottom tracking-normal shadow-[inset_0_-3px_0_var(--color-table-head-foreground)]',
                    c.id === 'siniestro' && ANCHO_PRIMERA,
                    c.id === 'dias' && 'text-center',
                    fija(c.id, true),
                    c.id === 'asegurado' &&
                      desborda &&
                      'shadow-[inset_-2px_0_0_var(--color-line-strong),inset_0_-3px_0_var(--color-table-head-foreground)]',
                  )}
                >
                  {encabezado(c)}
                </TableHead>
              ))}
              <TableHead
                scope="col"
                className="sticky top-0 z-20 w-px px-1 py-3 shadow-[inset_0_-3px_0_var(--color-table-head-foreground)]"
              >
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {siniestros.map((s) => (
              <TableRow key={s.id} className={cn(s.eliminado && 'bg-surface-subtle')}>
                {columnas.map((c) => (
                  <TableCell
                    key={c.id}
                    className={cn(
                      'border-b border-line px-2.5 py-3 align-top',
                      c.id === 'siniestro' && ANCHO_PRIMERA,
                      c.id === 'asegurado' && 'font-semibold',
                      c.id === 'dias' && 'text-center',
                      fija(c.id),
                    )}
                  >
                    {celda[c.id](s)}
                  </TableCell>
                ))}
                <TableCell className="w-px border-b border-line px-1 py-2 align-top">
                  <MenuAcciones nombre={`siniestro ${s.numeroSiniestro}`} acciones={acciones(s)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>
    </>
  )
}
