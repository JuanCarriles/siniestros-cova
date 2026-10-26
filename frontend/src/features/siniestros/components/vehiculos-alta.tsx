import { useRef, useState } from 'react'
import { Car, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  ROLES_ACCIDENTE,
  USOS_VEHICULO,
  type OpcionesAltaSiniestro,
  type VehiculoAltaData,
} from '@cova/shared/schemas/siniestros-alta'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { VehiculoBorrador } from '../borrador-alta'
import { VehiculoDialog } from './vehiculo-dialog'

// Paso 2 del alta, vehículos involucrados (CU-09 pasos 6-10, E4-05). Una tarjeta por vehículo, con lo que
// alcanza para reconocerlo: rol, marca y modelo, dominio, aseguradora y daños.
export function VehiculosAlta({
  vehiculos,
  onCambiar,
  aseguradoras,
  idAseguradoraSiniestro,
}: {
  vehiculos: VehiculoBorrador[]
  onCambiar: (vehiculos: VehiculoBorrador[]) => void
  aseguradoras: OpcionesAltaSiniestro['aseguradoras']
  idAseguradoraSiniestro: string
}) {
  // undefined: diálogo cerrado; null: agregar; un vehículo: modificarlo
  const [editando, setEditando] = useState<VehiculoBorrador | null | undefined>(undefined)
  const [quitando, setQuitando] = useState<VehiculoBorrador | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const origen = useRef<HTMLElement | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const volverA = () => (origen.current?.isConnected ? origen.current : titulo.current)

  function abrir(vehiculo: VehiculoBorrador | null, boton: HTMLElement) {
    origen.current = boton
    setMensaje(null)
    setEditando(vehiculo)
  }
  function guardar(datos: VehiculoAltaData) {
    const nueva = editando
      ? vehiculos.map((v) => (v.clave === editando.clave ? { ...datos, clave: v.clave } : v))
      : [...vehiculos, { ...datos, clave: crypto.randomUUID() }]
    onCambiar(nueva)
    setMensaje(
      editando
        ? `Se guardaron los cambios del vehículo ${datos.dominio}.`
        : `Se agregó el vehículo ${datos.dominio}.`,
    )
  }
  function quitar() {
    if (!quitando) return
    onCambiar(vehiculos.filter((v) => v.clave !== quitando.clave))
    setMensaje(`Se quitó el vehículo ${quitando.dominio}.`)
    setQuitando(null)
  }
  const nombreAseguradora = (id: number | null | undefined) =>
    id
      ? (aseguradoras.find((a) => a.id === id)?.nombre ?? 'Aseguradora dada de baja')
      : 'Sin seguro o no se sabe'

  return (
    <section
      aria-labelledby="vehiculos-titulo"
      className="rounded-xl border bg-card p-5 shadow-card sm:p-6"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2
          id="vehiculos-titulo"
          ref={titulo}
          tabIndex={-1}
          className="flex items-center gap-3 text-xl font-bold text-primary"
        >
          <span
            className="grid size-10 place-items-center rounded-lg bg-callout-bg"
            aria-hidden="true"
          >
            <Car className="size-5" />
          </span>
          Vehículos involucrados
          <span className="font-normal text-muted-foreground">({vehiculos.length})</span>
        </h2>
        {vehiculos.length > 0 && (
          <Button onClick={(e) => abrir(null, e.currentTarget)}>
            <Plus aria-hidden="true" />
            Agregar vehículo
          </Button>
        )}
      </div>

      <p role="status" className={cn(mensaje ? 'mb-4 font-semibold text-ok-ink' : 'sr-only')}>
        {mensaje}
      </p>

      {vehiculos.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-lg border-2 border-dashed border-line-strong px-6 py-10 text-center">
          <Car className="size-9 text-muted-foreground" aria-hidden="true" />
          <p className="text-lg font-semibold">Todavía no cargaste vehículos.</p>
          <p className="max-w-lg text-muted-foreground">
            Agregá cada vehículo que participó del accidente. Si el siniestro no involucra
            vehículos, podés continuar sin cargar ninguno.
          </p>
          <Button size="lg" onClick={(e) => abrir(null, e.currentTarget)}>
            <Plus aria-hidden="true" />
            Agregar vehículo
          </Button>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {vehiculos.map((v) => {
            const descripcion = [v.marca, v.modelo, v.version].filter(Boolean).join(' ')
            const detalles = [
              v.anio && String(v.anio),
              v.uso && USOS_VEHICULO[v.uso],
              v.color,
              v.tipo,
            ].filter(Boolean)
            return (
              <li
                key={v.clave}
                className={cn(
                  'grid content-start gap-3 rounded-lg border-2 p-4',
                  v.rolAccidente === 'ASEGURADO'
                    ? 'border-owner-border bg-owner-bg'
                    : 'border-line bg-surface',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1.5">
                    <span
                      className={cn(
                        'w-fit rounded px-2 text-sm font-bold tracking-wide uppercase',
                        v.rolAccidente === 'ASEGURADO'
                          ? 'bg-owner-ink text-primary-foreground'
                          : 'bg-neutral-bg text-neutral-ink',
                      )}
                    >
                      {ROLES_ACCIDENTE[v.rolAccidente]}
                    </span>
                    <h3 className="text-lg font-bold">
                      {descripcion || 'Vehículo sin marca ni modelo'}
                    </h3>
                  </div>
                  <Patente dominio={v.dominio} />
                </div>
                <dl className="grid gap-1 text-base">
                  {detalles.length > 0 && (
                    <div>
                      <dt className="sr-only">Datos</dt>
                      <dd>{detalles.join(' · ')}</dd>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-1.5">
                    <dt className="text-muted-foreground">Aseguradora:</dt>
                    <dd>{nombreAseguradora(v.idAseguradora)}</dd>
                  </div>
                  {v.acreedorPrendario && (
                    <div className="flex flex-wrap gap-x-1.5">
                      <dt className="text-muted-foreground">Acreedor prendario:</dt>
                      <dd>{v.acreedorPrendario}</dd>
                    </div>
                  )}
                  <div className="grid">
                    <dt className="text-muted-foreground">Daños:</dt>
                    <dd className="line-clamp-3 whitespace-pre-line">
                      {v.descripcionDanos ?? 'Sin describir todavía'}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button
                    variant="outline"
                    onClick={(e) => abrir(v, e.currentTarget)}
                    aria-label={`Modificar el vehículo ${v.dominio}`}
                  >
                    <Pencil aria-hidden="true" />
                    Modificar
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-danger-ink hover:bg-danger-bg hover:text-danger-ink"
                    onClick={(e) => {
                      origen.current = e.currentTarget
                      setMensaje(null)
                      setQuitando(v)
                    }}
                    aria-label={`Quitar el vehículo ${v.dominio}`}
                  >
                    <Trash2 aria-hidden="true" />
                    Quitar
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editando !== undefined && (
        <VehiculoDialog
          key={editando?.clave ?? 'nuevo'}
          vehiculo={editando}
          otros={vehiculos.filter((v) => v.clave !== editando?.clave)}
          aseguradoras={aseguradoras}
          idAseguradoraSiniestro={idAseguradoraSiniestro}
          onGuardar={guardar}
          onCerrar={() => setEditando(undefined)}
          elementoAlCerrar={volverA}
        />
      )}

      <Dialog open={quitando !== null} onOpenChange={(abrir) => !abrir && setQuitando(null)}>
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            volverA()?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>¿Quitar el vehículo {quitando?.dominio}?</DialogTitle>
            <DialogDescription>
              Se borra de esta alta junto con lo que cargaste de él. Lo podés volver a agregar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Conservar</Button>
            </DialogClose>
            <Button variant="destructive" onClick={quitar}>
              Quitar vehículo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

// El dominio como se ve en la chapa: se reconoce de un vistazo entre varios vehículos
function Patente({ dominio }: { dominio: string }) {
  return (
    <span className="grid min-w-32 overflow-hidden rounded-md border-2 border-ink bg-surface text-center shadow-card">
      <span
        className="bg-navy px-2 text-[0.625rem] font-bold tracking-[0.2em] text-on-navy"
        aria-hidden="true"
      >
        ARGENTINA
      </span>
      <span className="px-3 py-1 dato text-xl font-bold tracking-wider">
        <span className="sr-only">Dominio </span>
        {dominio}
      </span>
    </span>
  )
}
