import { useRef, useState } from 'react'
import { PersonStanding } from 'lucide-react'
import type {
  OpcionesAltaSiniestro,
  PersonaExternaAltaData,
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
import type { PersonaExternaBorrador, VehiculoBorrador } from '../borrador-alta'
import { nombresPersonas } from '../personas-alta'
import { PersonaDialog } from './persona-dialog'
import { BotonPersona, TarjetaPersona } from './tarjeta-persona'

// Paso 2 del alta (CU-09 pasos 19-22, E4-07): peatones, testigos, dueños de propiedades dañadas… Un bloque propio
// al final, después de los vehículos. Sin nombre siguen la numeración "Desconocido N" de las demás personas.
export function PersonasExternasAlta({
  personas,
  onCambiar,
  vehiculos,
  opciones,
}: {
  personas: PersonaExternaBorrador[]
  onCambiar: (personas: PersonaExternaBorrador[]) => void
  /** Solo para los nombres "Desconocido N" y el aviso de documento repetido */
  vehiculos: VehiculoBorrador[]
  opciones: OpcionesAltaSiniestro
}) {
  // undefined cerrado; null agregar; una persona, modificarla
  const [editando, setEditando] = useState<PersonaExternaBorrador | null | undefined>(undefined)
  const [quitando, setQuitando] = useState<{ persona: PersonaExternaBorrador; nombre: string }>()
  const [mensaje, setMensaje] = useState<string | null>(null)
  const origen = useRef<HTMLElement | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const volverA = () => (origen.current?.isConnected ? origen.current : titulo.current)
  const nombres = nombresPersonas({ vehiculos, personasExternas: personas })
  const tipoDocumento = (id: number | null | undefined) =>
    opciones.tiposDocumento.find((t) => t.id === id)?.nombre

  function desde(boton: HTMLElement) {
    origen.current = boton
    setMensaje(null)
  }
  function guardar(datos: PersonaExternaAltaData) {
    // "Guardar y agregar otra" deja el modal abierto en una nueva: cada guardado nuevo suma una persona
    if (editando) {
      onCambiar(
        personas.map((p) => (p.clave === editando.clave ? { ...datos, clave: p.clave } : p)),
      )
      setMensaje(`Se guardaron los cambios de la persona (${datos.rolSinVehiculo}).`)
    } else {
      onCambiar([...personas, { ...datos, clave: crypto.randomUUID() }])
      setMensaje(`Se agregó la persona (${datos.rolSinVehiculo}).`)
    }
  }
  function quitar() {
    if (!quitando) return
    onCambiar(personas.filter((p) => p.clave !== quitando.persona.clave))
    setMensaje(`Se quitó a ${quitando.nombre}.`)
    setQuitando(undefined)
  }
  const agregar = (boton: HTMLElement) => {
    desde(boton)
    setEditando(null)
  }

  return (
    <section
      aria-labelledby="personas-externas-titulo"
      className="rounded-xl border bg-card p-5 shadow-card sm:p-6"
    >
      <div className="mb-5 grid gap-1">
        <h2
          id="personas-externas-titulo"
          ref={titulo}
          tabIndex={-1}
          className="flex items-center gap-3 text-xl font-bold text-primary"
        >
          <span
            className="grid size-10 place-items-center rounded-lg bg-callout-bg"
            aria-hidden="true"
          >
            <PersonStanding className="size-6" />
          </span>
          Personas fuera de los vehículos
          <span className="font-normal text-muted-foreground">({personas.length})</span>
        </h2>
        <p className="text-muted-foreground">
          Peatones, testigos, dueños de propiedades dañadas y cualquier otra persona que no iba en
          un vehículo.
        </p>
      </div>

      <p role="status" className={cn(mensaje ? 'mb-4 font-semibold text-ok-ink' : 'sr-only')}>
        {mensaje}
      </p>

      {personas.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-lg border-2 border-dashed border-line-strong px-6 py-8 text-center">
          <p className="text-lg font-semibold">No cargaste personas fuera de los vehículos.</p>
          <p className="max-w-lg text-muted-foreground">
            Si nadie más participó del siniestro, podés continuar sin cargar ninguna.
          </p>
          <BotonPersona onClick={agregar}>Agregar persona</BotonPersona>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {personas.map((p) => (
            <TarjetaPersona
              key={p.clave}
              nombre={nombres.get(p.clave) ?? ''}
              persona={p}
              tipoDocumento={tipoDocumento(p.idTipoDocumento)}
              rol={p.rolSinVehiculo}
              onModificar={(boton) => {
                desde(boton)
                setEditando(p)
              }}
              onQuitar={(boton, nombre) => {
                desde(boton)
                setQuitando({ persona: p, nombre })
              }}
            />
          ))}
          <BotonPersona onClick={agregar}>Agregar persona</BotonPersona>
        </div>
      )}

      {editando !== undefined && (
        <PersonaDialog
          key={editando?.clave ?? 'nueva'}
          modo="externa"
          vehiculo={null}
          persona={editando}
          involucrados={{ vehiculos, personasExternas: personas }}
          opciones={opciones}
          onGuardar={(datos) => guardar(datos as PersonaExternaAltaData)}
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
            <DialogTitle>¿Quitar a {quitando?.nombre ?? ''}?</DialogTitle>
            <DialogDescription>
              Se borra de esta alta junto con lo que cargaste de esta persona. La podés volver a
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
