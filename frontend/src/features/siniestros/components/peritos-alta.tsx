import { useRef, useState } from 'react'
import {
  CircleCheck,
  ClipboardCheck,
  Clock,
  Mail,
  Pencil,
  Phone,
  Plus,
  Stethoscope,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { TipoPerito } from '@cova/shared/schemas/enums'
import type { PeritoAltaData } from '@cova/shared/schemas/siniestros-alta'
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
import type { PeritoBorrador } from '../borrador-alta'
import { ponerPerito } from '../peritos-alta'
import { PeritoDialog } from './perito-dialog'
import { BotonQuitar } from './tarjeta-persona'

/** AAAA-MM-DD como se lee acá: 12/10/2026 (sin pasar por Date, que la correría de día por la zona horaria) */
const fecha = (iso: string) => iso.split('-').reverse().join('/')

const LUGARES: { tipo: TipoPerito; titulo: string; nombre: string; icono: LucideIcon }[] = [
  { tipo: 'CESVI', titulo: 'Perito CESVI', nombre: 'perito CESVI', icono: Wrench },
  { tipo: 'MEDICO', titulo: 'Perito médico', nombre: 'perito médico', icono: Stethoscope },
]

// Paso 4 del alta (CU-09 pasos 28-31, E4-09). Un lugar para cada tipo: un perito CESVI y uno médico como máximo.
// Se puede continuar sin peritos (28.a).
export function PeritosAlta({
  peritos,
  onCambiar,
}: {
  peritos: PeritoBorrador[]
  onCambiar: (peritos: PeritoBorrador[]) => void
}) {
  const [editando, setEditando] = useState<TipoPerito | null>(null)
  const [quitando, setQuitando] = useState<PeritoBorrador>()
  const [mensaje, setMensaje] = useState<string | null>(null)
  const origen = useRef<HTMLElement | null>(null)
  const ultimoTipo = useRef<TipoPerito | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  // Al cargar o quitar, el botón que abrió el modal desaparece: el foco va al primer botón de ese lugar
  const volverA = () =>
    origen.current?.isConnected
      ? origen.current
      : (document
          .getElementById(`perito-${ultimoTipo.current}`)
          ?.parentElement?.querySelector<HTMLElement>('button') ?? titulo.current)
  const delTipo = (tipo: TipoPerito) => peritos.find((p) => p.tipoPerito === tipo) ?? null
  const nombreDe = (tipo: TipoPerito) => LUGARES.find((l) => l.tipo === tipo)?.nombre ?? ''

  function abrir(boton: HTMLElement, tipo: TipoPerito) {
    origen.current = boton
    ultimoTipo.current = tipo
    setMensaje(null)
    setEditando(tipo)
  }
  function guardar(datos: PeritoAltaData) {
    const existia = delTipo(datos.tipoPerito)
    onCambiar(ponerPerito(peritos, datos))
    setMensaje(
      `${existia ? 'Se guardaron los cambios del' : 'Se cargó el'} ${nombreDe(datos.tipoPerito)}${datos.cerrado ? '' : ': la pericia queda pendiente'}.`,
    )
  }
  function quitar() {
    if (!quitando) return
    onCambiar(peritos.filter((p) => p.tipoPerito !== quitando.tipoPerito))
    setMensaje(`Se quitó el ${nombreDe(quitando.tipoPerito)}.`)
    setQuitando(undefined)
  }

  return (
    <section
      aria-labelledby="peritos-titulo"
      className="rounded-xl border bg-card p-5 shadow-card sm:p-6"
    >
      <div className="mb-5 grid gap-1">
        <h2
          id="peritos-titulo"
          ref={titulo}
          tabIndex={-1}
          className="flex items-center gap-3 text-xl font-bold text-primary"
        >
          <span
            className="grid size-10 place-items-center rounded-lg bg-callout-bg"
            aria-hidden="true"
          >
            <ClipboardCheck className="size-5" />
          </span>
          Peritos
        </h2>
        <p className="text-muted-foreground">
          Un perito CESVI y uno médico como máximo. Si el siniestro no requiere peritos, podés
          continuar sin cargarlos.
        </p>
      </div>

      <p role="status" className={cn(mensaje ? 'mb-4 font-semibold text-ok-ink' : 'sr-only')}>
        {mensaje}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {LUGARES.map(({ tipo, titulo: tituloLugar, nombre, icono: Icono }) => {
          const p = delTipo(tipo)
          const contacto = p
            ? [
                p.telefono && { icono: Phone, texto: p.telefono, etiqueta: 'Teléfono' },
                p.email && { icono: Mail, texto: p.email, etiqueta: 'Email' },
              ].filter((x) => !!x)
            : []
          return (
            <section
              key={tipo}
              aria-labelledby={`perito-${tipo}`}
              className={cn(
                'grid content-start overflow-hidden rounded-lg border-2',
                p ? 'border-line-strong bg-surface' : 'border-dashed border-line-strong',
              )}
            >
              <h3
                id={`perito-${tipo}`}
                className="flex items-center gap-2.5 border-b-2 border-line-strong bg-table-head px-4 py-2.5 text-lg font-bold text-table-head-foreground"
              >
                <Icono className="size-5 shrink-0" aria-hidden="true" />
                {tituloLugar}
              </h3>
              {p ? (
                <div className="grid gap-3 p-4">
                  <div className="grid gap-1">
                    <p className="text-lg font-bold">{p.nombre}</p>
                    {contacto.map(({ icono: IconoDato, texto, etiqueta }) => (
                      <p key={etiqueta} className="flex items-center gap-2 break-all">
                        <IconoDato
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="sr-only">{etiqueta}: </span>
                        {texto}
                      </p>
                    ))}
                    <p>
                      <span className="text-muted-foreground">Solicitada el </span>
                      <span className="dato">{fecha(p.fechaSolicitud)}</span>
                    </p>
                  </div>
                  {p.fechaCierre ? (
                    <p className="flex w-fit items-center gap-2 rounded-md border-2 border-ok-ink bg-ok-bg px-2.5 py-1 font-semibold text-ok-ink">
                      <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
                      Cerrada el <span className="dato">{fecha(p.fechaCierre)}</span>
                    </p>
                  ) : (
                    <p className="flex w-fit items-center gap-2 rounded-md border-2 border-warning-ink bg-warning-bg px-2.5 py-1 font-semibold text-warning-ink">
                      <Clock className="size-5 shrink-0" aria-hidden="true" />
                      Pericia pendiente
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={(e) => abrir(e.currentTarget, tipo)}
                      aria-label={`Modificar el ${nombre}`}
                    >
                      <Pencil aria-hidden="true" />
                      Modificar
                    </Button>
                    <BotonQuitar
                      etiqueta={`Quitar el ${nombre}`}
                      onClick={(e) => {
                        origen.current = e.currentTarget
                        ultimoTipo.current = tipo
                        setMensaje(null)
                        setQuitando(p)
                      }}
                    >
                      Quitar
                    </BotonQuitar>
                  </div>
                </div>
              ) : (
                <div className="grid justify-items-start gap-3 p-4">
                  <p className="text-muted-foreground">Sin {nombre} por ahora.</p>
                  <Button variant="outline" onClick={(e) => abrir(e.currentTarget, tipo)}>
                    <Plus aria-hidden="true" />
                    Cargar {nombre}
                  </Button>
                </div>
              )}
            </section>
          )
        })}
      </div>

      {editando && (
        <PeritoDialog
          key={editando}
          tipo={editando}
          perito={delTipo(editando)}
          onGuardar={guardar}
          onCerrar={() => setEditando(null)}
          elementoAlCerrar={volverA}
        />
      )}

      <Dialog
        open={quitando !== undefined}
        onOpenChange={(abrir) => !abrir && setQuitando(undefined)}
      >
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            volverA()?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              ¿Quitar el {quitando ? nombreDe(quitando.tipoPerito) : 'perito'}?
            </DialogTitle>
            <DialogDescription>
              Se borra de esta alta {quitando ? `(${quitando.nombre})` : ''}. Lo podés volver a
              cargar.
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
