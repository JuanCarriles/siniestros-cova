import { useState } from 'react'
import type { AbogadoFicha, PeritoFicha, VehiculoFicha } from '@cova/shared/schemas/ficha-siniestro'
import type { VehiculoConPersonas } from '@cova/shared/schemas/partes-siniestro'
import { Aviso } from '@/components/aviso'
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
import { ApiError } from '@/lib/api'
import { nombreDe } from '../formato'
import type { PersonaEnFicha } from './persona-ficha'

export type PedidoBaja =
  | { tipo: 'vehiculo'; vehiculo: VehiculoFicha }
  | { tipo: 'persona'; persona: PersonaEnFicha }
  | { tipo: 'abogado'; abogado: AbogadoFicha }
  | { tipo: 'perito'; perito: PeritoFicha; nombreTipo: string }

type PersonaPendiente = VehiculoConPersonas['personas'][number]

const personasDelVehiculo = (v: VehiculoFicha): PersonaPendiente[] => [
  ...(v.titular ? [{ id: v.titular.id, nombre: v.titular.nombre, rol: 'titular' as const }] : []),
  ...v.ocupantes.map((o) => ({ id: o.id, nombre: o.nombre, rol: 'ocupante' as const })),
]

/** "titular del vehículo Ford Ranger (AB123CD)" / "testigo" */
function comoFigura(p: PersonaEnFicha) {
  if (p.tipo === 'fuera')
    return p.persona.rolSinVehiculo?.toLocaleLowerCase('es') ?? 'persona fuera de los vehículos'
  return `${p.tipo} del vehículo ${p.vehiculo}`
}

// Dar de baja un vehículo, una persona (CU-10 1.c.6, E5-06), un abogado o un perito (1.d y 1.e, E5-07) desde la
// ficha: se confirma antes. Un vehículo con titular u ocupantes no se puede dar de baja (1.c.6.1): el modal dice a
// quiénes dar de baja primero, sin botón para seguir.
export function BajaParteDialog({
  pedido: pedidoActual,
  onConfirmar,
  onCerrar,
  elementoAlCerrar,
}: {
  pedido: PedidoBaja | null
  /** Da de baja en el servidor; si falla, el modal muestra el motivo */
  onConfirmar: (pedido: PedidoBaja) => Promise<void>
  onCerrar: () => void
  elementoAlCerrar: () => HTMLElement | null
}) {
  // Mientras se cierra, sigue mostrando el último pedido
  const [pedido, setPedido] = useState(pedidoActual)
  const [error, setError] = useState<string | null>(null)
  const [pendientesServidor, setPendientesServidor] = useState<PersonaPendiente[] | null>(null)
  const [enviando, setEnviando] = useState(false)
  if (pedidoActual && pedidoActual !== pedido) {
    setPedido(pedidoActual)
    setError(null)
    setPendientesServidor(null)
  }

  // El servidor puede saber de alguien cargado desde otra pestaña: manda su lista
  const pendientes =
    pedido?.tipo === 'vehiculo' ? (pendientesServidor ?? personasDelVehiculo(pedido.vehiculo)) : []

  async function confirmar() {
    if (!pedido) return
    setEnviando(true)
    setError(null)
    try {
      await onConfirmar(pedido)
    } catch (err) {
      const detalle =
        err instanceof ApiError ? (err.detalles as VehiculoConPersonas | undefined) : undefined
      if (detalle?.codigo === 'VEHICULO_CON_PERSONAS') setPendientesServidor(detalle.personas)
      else
        setError(
          err instanceof ApiError
            ? err.message
            : 'No se pudo dar de baja. Revisá la conexión y probá de nuevo.',
        )
    } finally {
      setEnviando(false)
    }
  }

  let titulo = ''
  let descripcion = ''
  if (pedido?.tipo === 'vehiculo') {
    const una = pendientes.length === 1
    titulo = pendientes.length
      ? `Primero hay que dar de baja a ${una ? 'su persona' : 'sus personas'}`
      : `¿Dar de baja el vehículo ${pedido.vehiculo.dominio}?`
    descripcion = pendientes.length
      ? `El vehículo ${pedido.vehiculo.dominio} tiene ${una ? 'una persona cargada. Dala' : `${pendientes.length} personas cargadas. Dalas`} de baja desde su tarjeta y después volvé a dar de baja el vehículo.`
      : 'Deja de verse en la ficha. El cambio queda en el historial del siniestro.'
  } else if (pedido?.tipo === 'persona') {
    titulo = `¿Dar de baja a ${nombreDe(pedido.persona.persona)}?`
    descripcion = `Deja de figurar como ${comoFigura(pedido.persona)}${pedido.persona.persona.abogado ? ' y entre los representados de su abogado' : ''}. El cambio queda en el historial del siniestro.`
  } else if (pedido?.tipo === 'abogado') {
    const { nombreCompleto, representa } = pedido.abogado
    titulo = `¿Dar de baja al abogado ${nombreCompleto}?`
    descripcion = `Deja de figurar en este siniestro y ${
      representa.length === 1
        ? `${nombreDe(representa[0])} queda`
        : `las ${representa.length} personas que representa quedan`
    } sin abogado. El cambio queda en el historial del siniestro.`
  } else if (pedido?.tipo === 'perito') {
    titulo = `¿Dar de baja al ${pedido.nombreTipo} ${pedido.perito.nombre}?`
    descripcion =
      'Deja de figurar en el siniestro y su lugar queda libre para cargar otro. El cambio queda en el historial del siniestro.'
  }

  return (
    <Dialog
      open={pedidoActual !== null}
      onOpenChange={(abierto) => !abierto && !enviando && onCerrar()}
    >
      <DialogContent
        showCloseButton={!enviando}
        onCloseAutoFocus={(e) => {
          const elemento = elementoAlCerrar()
          if (elemento) {
            e.preventDefault()
            elemento.focus()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        {pendientes.length > 0 && (
          <ul className="grid gap-2">
            {pendientes.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border-2 border-line-strong bg-surface-subtle px-4 py-2"
              >
                <strong>{nombreDe(p)}</strong>{' '}
                <span className="text-muted-foreground">({p.rol})</span>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <Aviso tipo="error" enfocar>
            {error}
          </Aviso>
        )}
        <DialogFooter className="gap-3">
          {pendientes.length > 0 ? (
            <DialogClose asChild>
              <Button>Entendido</Button>
            </DialogClose>
          ) : (
            <>
              <DialogClose asChild>
                <Button variant="outline" disabled={enviando}>
                  Conservar
                </Button>
              </DialogClose>
              <Button variant="destructive" loading={enviando} onClick={() => void confirmar()}>
                Dar de baja
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
