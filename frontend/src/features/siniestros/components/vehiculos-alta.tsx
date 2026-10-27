import { useRef, useState, type ReactNode } from 'react'
import {
  Car,
  ChevronDown,
  Pencil,
  Plus,
  TriangleAlert,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import {
  ROLES_ACCIDENTE,
  USOS_VEHICULO,
  type OcupanteAltaData,
  type OpcionesAltaSiniestro,
  type PersonaExternaAltaData,
  type TitularAltaData,
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
import type {
  OcupanteBorrador,
  PersonaExternaBorrador,
  TitularBorrador,
  VehiculoBorrador,
} from '../borrador-alta'
import { nombresPersonas } from '../personas-alta'
import { PersonaDialog } from './persona-dialog'
import { BotonPersona, BotonQuitar, TarjetaPersona } from './tarjeta-persona'
import { VehiculoDialog } from './vehiculo-dialog'

type ModoEnVehiculo = 'titular' | 'ocupante'
type PersonaBorrador = TitularBorrador | OcupanteBorrador
type EdicionPersona = {
  modo: ModoEnVehiculo
  claveVehiculo: string
  persona: PersonaBorrador | null
}
type Quitando =
  | { tipo: 'vehiculo'; vehiculo: VehiculoBorrador }
  | { tipo: ModoEnVehiculo; vehiculo: VehiculoBorrador; persona: PersonaBorrador; nombre: string }

const lugarDe = (p: { lugar?: string | null; lugarOtro?: string | null }) =>
  p.lugar === 'Otro' ? p.lugarOtro : p.lugar

// Paso 2 del alta (CU-09 pasos 6-18, E4-05 y E4-06). Un bloque plegable por vehículo: cerrado dice qué vehículo
// es y quién es su titular; abierto muestra sus datos, el titular y los ocupantes.
export function VehiculosAlta({
  vehiculos,
  personasExternas,
  onCambiar,
  opciones,
  idAseguradoraSiniestro,
}: {
  vehiculos: VehiculoBorrador[]
  /** Solo para los nombres "Desconocido N" y el aviso de documento repetido */
  personasExternas: PersonaExternaBorrador[]
  onCambiar: (vehiculos: VehiculoBorrador[]) => void
  opciones: OpcionesAltaSiniestro
  idAseguradoraSiniestro: string
}) {
  // Vehículo: undefined cerrado; null agregar; un vehículo, modificarlo
  const [editando, setEditando] = useState<VehiculoBorrador | null | undefined>(undefined)
  const [persona, setPersona] = useState<EdicionPersona | null>(null)
  const [quitando, setQuitando] = useState<Quitando | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  // Abiertos: al entrar, todos; uno nuevo se abre solo
  const [abiertos, setAbiertos] = useState(() => new Set(vehiculos.map((v) => v.clave)))
  const origen = useRef<HTMLElement | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const volverA = () => (origen.current?.isConnected ? origen.current : titulo.current)
  const nombres = nombresPersonas({ vehiculos, personasExternas })

  function desde(boton: HTMLElement) {
    origen.current = boton
    setMensaje(null)
  }
  function alternar(clave: string, abierto: boolean) {
    setAbiertos((actuales) => {
      if (actuales.has(clave) === abierto) return actuales
      const nuevos = new Set(actuales)
      if (abierto) nuevos.add(clave)
      else nuevos.delete(clave)
      return nuevos
    })
  }
  function cambiarVehiculo(clave: string, cambio: (v: VehiculoBorrador) => VehiculoBorrador) {
    onCambiar(vehiculos.map((v) => (v.clave === clave ? cambio(v) : v)))
  }

  function guardarVehiculo(datos: VehiculoAltaData) {
    if (editando) cambiarVehiculo(editando.clave, (v) => ({ ...v, ...datos }))
    else {
      const clave = crypto.randomUUID()
      onCambiar([...vehiculos, { ...datos, clave, titular: null, ocupantes: [] }])
      alternar(clave, true)
    }
    setMensaje(
      editando
        ? `Se guardaron los cambios del vehículo ${datos.dominio}.`
        : `Se agregó el vehículo ${datos.dominio}.`,
    )
  }
  function guardarPersona(datos: TitularAltaData | OcupanteAltaData | PersonaExternaAltaData) {
    if (!persona) return
    const clave = persona.persona?.clave ?? crypto.randomUUID()
    const vehiculo = vehiculos.find((v) => v.clave === persona.claveVehiculo)
    cambiarVehiculo(persona.claveVehiculo, (v) =>
      persona.modo === 'titular'
        ? { ...v, titular: { ...(datos as TitularAltaData), clave } }
        : {
            ...v,
            ocupantes: persona.persona
              ? v.ocupantes.map((o) =>
                  o.clave === clave ? { ...(datos as OcupanteAltaData), clave } : o,
                )
              : [...v.ocupantes, { ...(datos as OcupanteAltaData), clave }],
          },
    )
    const quien = persona.modo === 'titular' ? 'el titular' : 'el ocupante'
    setMensaje(
      `${persona.persona ? 'Se guardaron los cambios de' : 'Se agregó'} ${quien} del vehículo ${vehiculo?.dominio ?? ''}.`,
    )
  }
  function quitar() {
    if (!quitando) return
    if (quitando.tipo === 'vehiculo') {
      onCambiar(vehiculos.filter((v) => v.clave !== quitando.vehiculo.clave))
      setMensaje(`Se quitó el vehículo ${quitando.vehiculo.dominio}.`)
    } else {
      const { persona: quitada, nombre } = quitando
      cambiarVehiculo(quitando.vehiculo.clave, (v) =>
        quitando.tipo === 'titular'
          ? { ...v, titular: null }
          : { ...v, ocupantes: v.ocupantes.filter((o) => o.clave !== quitada.clave) },
      )
      setMensaje(`Se quitó a ${nombre} del vehículo ${quitando.vehiculo.dominio}.`)
    }
    setQuitando(null)
  }
  const nombreAseguradora = (id: number | null | undefined) =>
    id
      ? (opciones.aseguradoras.find((a) => a.id === id)?.nombre ?? 'Aseguradora dada de baja')
      : 'Sin seguro o no se sabe'
  const tipoDocumento = (id: number | null | undefined) =>
    opciones.tiposDocumento.find((t) => t.id === id)?.nombre
  const vehiculoEnEdicion = persona && vehiculos.find((v) => v.clave === persona.claveVehiculo)

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
          <Button
            onClick={(e) => {
              desde(e.currentTarget)
              setEditando(null)
            }}
          >
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
          <Button
            size="lg"
            onClick={(e) => {
              desde(e.currentTarget)
              setEditando(null)
            }}
          >
            <Plus aria-hidden="true" />
            Agregar vehículo
          </Button>
        </div>
      ) : (
        <ul className="grid gap-8">
          {vehiculos.map((v) => {
            const asegurado = v.rolAccidente === 'ASEGURADO'
            const descripcion = [v.marca, v.modelo, v.version].filter(Boolean).join(' ')
            const detalles = [
              v.anio && String(v.anio),
              v.uso && USOS_VEHICULO[v.uso],
              v.color,
              v.tipo,
            ].filter(Boolean)
            const ocupantes =
              v.ocupantes.length === 1 ? '1 ocupante' : `${v.ocupantes.length} ocupantes`
            return (
              <li
                key={v.clave}
                // Cada vehículo, un bloque bien marcado: borde grueso, sombra y una franja del color de su rol
                className={cn(
                  'overflow-hidden rounded-xl border-2 border-l-[10px] shadow-card',
                  asegurado ? 'border-owner-ink bg-owner-bg' : 'border-navy bg-surface-subtle',
                )}
              >
                <details
                  className="group"
                  open={abiertos.has(v.clave)}
                  onToggle={(e) => alternar(v.clave, e.currentTarget.open)}
                >
                  <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 p-4 hover:bg-accent/60 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring sm:grid-cols-[auto_1fr_auto] [&::-webkit-details-marker]:hidden">
                    <ChevronDown
                      className="size-7 shrink-0 text-primary transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                    <span className="grid min-w-0 gap-1.5">
                      <span
                        className={cn(
                          'w-fit rounded px-2 text-sm font-bold tracking-wide uppercase',
                          asegurado
                            ? 'bg-owner-ink text-primary-foreground'
                            : 'bg-neutral-bg text-neutral-ink',
                        )}
                      >
                        {ROLES_ACCIDENTE[v.rolAccidente]}
                      </span>
                      <span className="text-lg font-bold">
                        {descripcion || 'Vehículo sin marca ni modelo'}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 text-base">
                        {v.titular ? (
                          <span>
                            Titular: <strong>{nombres.get(v.titular.clave)}</strong>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-warning-ink">
                            <TriangleAlert className="size-4" aria-hidden="true" />
                            Falta el titular
                          </span>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{ocupantes}</span>
                      </span>
                    </span>
                    {/* En el celular, debajo de los datos; en pantallas más anchas, a la derecha */}
                    <span className="col-start-2 sm:col-start-auto">
                      <Patente dominio={v.dominio} />
                    </span>
                  </summary>

                  <div className="grid gap-5 border-t-2 border-line-strong p-4 sm:p-5">
                    <Panel icono={Car} titulo="Datos del vehículo" tono="vehiculo">
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
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={(e) => {
                            desde(e.currentTarget)
                            setEditando(v)
                          }}
                          aria-label={`Modificar el vehículo ${v.dominio}`}
                        >
                          <Pencil aria-hidden="true" />
                          Modificar vehículo
                        </Button>
                        <BotonQuitar
                          etiqueta={`Quitar el vehículo ${v.dominio}`}
                          onClick={(e) => {
                            desde(e.currentTarget)
                            setQuitando({ tipo: 'vehiculo', vehiculo: v })
                          }}
                        >
                          Quitar vehículo
                        </BotonQuitar>
                      </div>
                    </Panel>

                    <Panel icono={UserRound} titulo="Titular">
                      {v.titular ? (
                        <TarjetaPersona
                          nombre={nombres.get(v.titular.clave) ?? ''}
                          persona={v.titular}
                          tipoDocumento={tipoDocumento(v.titular.idTipoDocumento)}
                          situacion={
                            v.titular.ibaEnVehiculo
                              ? ['Iba en el vehículo', lugarDe(v.titular)]
                                  .filter(Boolean)
                                  .join(' · ')
                              : 'No iba en el vehículo'
                          }
                          onModificar={(boton) => {
                            desde(boton)
                            setPersona({
                              modo: 'titular',
                              claveVehiculo: v.clave,
                              persona: v.titular,
                            })
                          }}
                          onQuitar={(boton, nombre) => {
                            desde(boton)
                            if (v.titular)
                              setQuitando({
                                tipo: 'titular',
                                vehiculo: v,
                                persona: v.titular,
                                nombre,
                              })
                          }}
                        />
                      ) : (
                        <BotonPersona
                          onClick={(boton) => {
                            desde(boton)
                            setPersona({ modo: 'titular', claveVehiculo: v.clave, persona: null })
                          }}
                        >
                          Cargar titular
                        </BotonPersona>
                      )}
                    </Panel>

                    <Panel icono={Users} titulo={`Ocupantes (${v.ocupantes.length})`} grilla>
                      {v.ocupantes.map((o) => (
                        <TarjetaPersona
                          key={o.clave}
                          nombre={nombres.get(o.clave) ?? ''}
                          persona={o}
                          tipoDocumento={tipoDocumento(o.idTipoDocumento)}
                          situacion={[lugarDe(o) ?? 'Ocupante', o.relacionPropietario]
                            .filter(Boolean)
                            .join(' · ')}
                          onModificar={(boton) => {
                            desde(boton)
                            setPersona({ modo: 'ocupante', claveVehiculo: v.clave, persona: o })
                          }}
                          onQuitar={(boton, nombre) => {
                            desde(boton)
                            setQuitando({ tipo: 'ocupante', vehiculo: v, persona: o, nombre })
                          }}
                        />
                      ))}
                      <BotonPersona
                        onClick={(boton) => {
                          desde(boton)
                          setPersona({ modo: 'ocupante', claveVehiculo: v.clave, persona: null })
                        }}
                      >
                        Agregar ocupante
                      </BotonPersona>
                    </Panel>
                  </div>
                </details>
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
          aseguradoras={opciones.aseguradoras}
          idAseguradoraSiniestro={idAseguradoraSiniestro}
          onGuardar={guardarVehiculo}
          onCerrar={() => setEditando(undefined)}
          elementoAlCerrar={volverA}
        />
      )}

      {persona && vehiculoEnEdicion && (
        <PersonaDialog
          key={`${persona.modo}-${persona.persona?.clave ?? 'nueva'}`}
          modo={persona.modo}
          vehiculo={vehiculoEnEdicion}
          persona={persona.persona}
          involucrados={{ vehiculos, personasExternas }}
          opciones={opciones}
          onGuardar={guardarPersona}
          onCerrar={() => setPersona(null)}
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
            <DialogTitle>
              {quitando?.tipo === 'vehiculo'
                ? `¿Quitar el vehículo ${quitando.vehiculo.dominio}?`
                : `¿Quitar a ${quitando?.nombre ?? ''}?`}
            </DialogTitle>
            <DialogDescription>
              {quitando?.tipo === 'vehiculo'
                ? 'Se borra de esta alta junto con su titular, sus ocupantes y lo que cargaste de él.'
                : `Se borra como ${quitando?.tipo ?? ''} del vehículo ${quitando?.vehiculo.dominio ?? ''}.`}{' '}
              Lo podés volver a cargar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Conservar</Button>
            </DialogClose>
            <Button variant="destructive" onClick={quitar}>
              Quitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

// Cada parte de un vehículo (sus datos, el titular, los ocupantes) en su propio recuadro con encabezado
function Panel({
  icono: Icono,
  titulo,
  grilla = false,
  tono = 'personas',
  children,
}: {
  icono: LucideIcon
  titulo: string
  /** Varias tarjetas: en dos columnas en pantallas anchas */
  grilla?: boolean
  /** El encabezado de los datos del vehículo se distingue del de las personas */
  tono?: 'vehiculo' | 'personas'
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-lg border-2 border-line-strong bg-surface">
      <h3
        className={cn(
          'flex items-center gap-2.5 border-b-2 px-4 py-2.5 text-lg font-bold',
          tono === 'vehiculo'
            ? 'border-navy bg-navy text-on-navy'
            : 'border-line-strong bg-table-head text-table-head-foreground',
        )}
      >
        <Icono className="size-5 shrink-0" aria-hidden="true" />
        {titulo}
      </h3>
      <div className={cn('grid gap-3 p-4', grilla && 'lg:grid-cols-2')}>{children}</div>
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
