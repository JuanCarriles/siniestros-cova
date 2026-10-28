import { useRef, useState } from 'react'
import { Mail, Pencil, Phone, Plus, Scale, TriangleAlert } from 'lucide-react'
import type { AbogadoAltaData } from '@cova/shared/schemas/siniestros-alta'
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
import {
  gruposRepresentables,
  guardarAbogado,
  personasPorClave,
  representantes,
} from '../abogados-alta'
import type { AbogadoBorrador } from '../borrador-alta'
import { nombresPersonas, type Involucrados } from '../personas-alta'
import { AbogadoDialog } from './abogado-dialog'
import { BotonQuitar } from './tarjeta-persona'

// Paso 3 del alta (CU-09 pasos 23-27, E4-08): los abogados del siniestro y a quién representa cada uno. Se puede
// continuar sin cargar ninguno (24.a). Para cargar uno tiene que haber personas en el paso 2.
export function AbogadosAlta({
  abogados,
  onCambiar,
  involucrados,
}: {
  abogados: AbogadoBorrador[]
  onCambiar: (abogados: AbogadoBorrador[]) => void
  involucrados: Involucrados
}) {
  // undefined cerrado; null agregar; un abogado, modificarlo
  const [editando, setEditando] = useState<AbogadoBorrador | null | undefined>(undefined)
  const [quitando, setQuitando] = useState<AbogadoBorrador>()
  const [mensaje, setMensaje] = useState<string | null>(null)
  const origen = useRef<HTMLElement | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const volverA = () => (origen.current?.isConnected ? origen.current : titulo.current)
  const grupos = gruposRepresentables(involucrados, nombresPersonas(involucrados))
  const personas = personasPorClave(grupos)
  const sinPersonas = grupos.length === 0

  function desde(boton: HTMLElement) {
    origen.current = boton
    setMensaje(null)
  }
  const agregar = (boton: HTMLElement) => {
    desde(boton)
    setEditando(null)
  }
  function guardar(datos: AbogadoAltaData) {
    const abogado = { ...datos, clave: editando?.clave ?? crypto.randomUUID() }
    const resultado = guardarAbogado(abogados, abogado)
    onCambiar(resultado.abogados)
    const pasadas = resultado.pasadas.map(
      (p) =>
        `${p.abogado} dejó de representar a ${p.cantidad === 1 ? 'una persona' : `${p.cantidad} personas`}.`,
    )
    setMensaje(
      [
        editando
          ? `Se guardaron los cambios de ${datos.nombreCompleto}.`
          : `Se agregó a ${datos.nombreCompleto}.`,
        ...pasadas,
      ].join(' '),
    )
  }
  function quitar() {
    if (!quitando) return
    onCambiar(abogados.filter((a) => a.clave !== quitando.clave))
    setMensaje(`Se quitó a ${quitando.nombreCompleto}.`)
    setQuitando(undefined)
  }

  return (
    <section
      aria-labelledby="abogados-titulo"
      className="rounded-xl border bg-card p-5 shadow-card sm:p-6"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h2
            id="abogados-titulo"
            ref={titulo}
            tabIndex={-1}
            className="flex items-center gap-3 text-xl font-bold text-primary"
          >
            <span
              className="grid size-10 place-items-center rounded-lg bg-callout-bg"
              aria-hidden="true"
            >
              <Scale className="size-5" />
            </span>
            Abogados
            <span className="font-normal text-muted-foreground">({abogados.length})</span>
          </h2>
          <p className="text-muted-foreground">
            Los abogados de las partes y a quién representa cada uno.
          </p>
        </div>
        {abogados.length > 0 && !sinPersonas && (
          <Button onClick={(e) => agregar(e.currentTarget)}>
            <Plus aria-hidden="true" />
            Agregar abogado
          </Button>
        )}
      </div>

      <p role="status" className={cn(mensaje ? 'mb-4 font-semibold text-ok-ink' : 'sr-only')}>
        {mensaje}
      </p>

      {abogados.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-lg border-2 border-dashed border-line-strong px-6 py-10 text-center">
          <Scale className="size-9 text-muted-foreground" aria-hidden="true" />
          {sinPersonas ? (
            <>
              <p className="text-lg font-semibold">Todavía no hay personas cargadas.</p>
              <p className="max-w-lg text-muted-foreground">
                Un abogado representa a personas del siniestro: para cargarlo, primero agregá en el
                paso anterior los titulares, ocupantes o personas fuera de los vehículos. Si nadie
                tiene abogado, podés continuar.
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold">No cargaste abogados.</p>
              <p className="max-w-lg text-muted-foreground">
                Si ninguna de las partes tiene abogado, podés continuar sin cargar ninguno.
              </p>
              <Button size="lg" onClick={(e) => agregar(e.currentTarget)}>
                <Plus aria-hidden="true" />
                Agregar abogado
              </Button>
            </>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {abogados.map((a) => {
            const contacto = [
              a.telefono && { icono: Phone, texto: a.telefono, etiqueta: 'Teléfono' },
              a.email && { icono: Mail, texto: a.email, etiqueta: 'Email' },
            ].filter((x) => !!x)
            return (
              <li
                key={a.clave}
                className={cn(
                  'grid content-start gap-3 rounded-lg border-2 bg-surface-subtle p-4',
                  a.representados.length === 0 ? 'border-warning-ink' : 'border-line-strong',
                )}
              >
                <div className="grid gap-1">
                  <p className="text-lg font-bold">{a.nombreCompleto}</p>
                  {a.numeroMatricula && (
                    <p>
                      <span className="text-muted-foreground">Matrícula </span>
                      <span className="dato">{a.numeroMatricula}</span>
                    </p>
                  )}
                  {contacto.map(({ icono: Icono, texto, etiqueta }) => (
                    <p key={etiqueta} className="flex items-center gap-2 break-all">
                      <Icono className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="sr-only">{etiqueta}: </span>
                      {texto}
                    </p>
                  ))}
                </div>

                <div className="grid gap-1.5 border-t-2 border-line pt-3">
                  <p className="font-semibold">Representa a</p>
                  {a.representados.length === 0 ? (
                    <p className="inline-flex items-center gap-1.5 font-semibold text-warning-ink">
                      <TriangleAlert className="size-4" aria-hidden="true" />
                      Este abogado no tiene personas asignadas. Asignale alguna o quitalo para
                      continuar.
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {a.representados.map((c) => {
                        const p = personas.get(c)
                        if (!p) return null
                        return (
                          <li
                            key={c}
                            className="rounded-md border-2 border-line-strong bg-surface px-2.5 py-1"
                          >
                            <span className="font-semibold">{p.nombre}</span>
                            <span className="text-muted-foreground">
                              {' · '}
                              {[p.detalle, p.dominio].filter(Boolean).join(' · ')}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={(e) => {
                      desde(e.currentTarget)
                      setEditando(a)
                    }}
                    aria-label={`Modificar a ${a.nombreCompleto}`}
                  >
                    <Pencil aria-hidden="true" />
                    Modificar
                  </Button>
                  <BotonQuitar
                    etiqueta={`Quitar a ${a.nombreCompleto}`}
                    onClick={(e) => {
                      desde(e.currentTarget)
                      setQuitando(a)
                    }}
                  >
                    Quitar
                  </BotonQuitar>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editando !== undefined && (
        <AbogadoDialog
          key={editando?.clave ?? 'nuevo'}
          abogado={editando}
          grupos={grupos}
          representantes={representantes(abogados)}
          onGuardar={guardar}
          onCerrar={() => setEditando(undefined)}
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
            <DialogTitle>¿Quitar a {quitando?.nombreCompleto ?? ''}?</DialogTitle>
            <DialogDescription>
              Se borra de esta alta y las personas que representaba quedan sin abogado. Lo podés
              volver a cargar.
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
