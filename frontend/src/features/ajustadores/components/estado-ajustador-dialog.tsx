import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, TriangleAlert } from 'lucide-react'
import {
  bloqueoBajaAjustadorSchema,
  type AjustadorListado,
  type BloqueoBajaAjustador,
} from '@cova/shared/schemas/ajustadores'
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
import { darDeBajaAjustador, reactivarAjustador } from '../api/ajustadores.api'

export type CambioEstadoAjustador = { tipo: 'baja' | 'reactivar'; ajustador: AjustadorListado }

// CU-03 3.a (baja) y 3.c (reactivar): ambas piden confirmación. Si no se puede (siniestros activos, aseguradora
// dada de baja), en lugar de confirmar explica por qué y qué hacer. El backend también lo rechaza.
export function EstadoAjustadorDialog({
  abierto,
  elementoAlCerrar,
  cambio,
  onCerrar,
  onHecho,
  onDesactualizado,
}: {
  /** Separado de "cambio": al cerrar, el contenido no cambia durante la animación de salida */
  abierto: boolean
  /** Dónde poner el foco al cerrar (el ⋮ de la fila); sin él, Radix lo devuelve a lo que estaba enfocado */
  elementoAlCerrar?: () => HTMLElement | null
  cambio: CambioEstadoAjustador | null
  onCerrar: () => void
  onHecho: (mensaje: string) => void
  /** El servidor rechazó la baja por siniestros que la lista no mostraba: hay que volver a cargarla */
  onDesactualizado?: () => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bloqueoServidor, setBloqueoServidor] = useState<BloqueoBajaAjustador | null>(null)
  const principal = useRef<HTMLButtonElement>(null)

  const ajustador = cambio?.ajustador
  const bloqueo = bloqueoServidor?.idAjustador === ajustador?.id ? bloqueoServidor : null
  const nombre = ajustador ? `${ajustador.nombres} ${ajustador.apellidos}` : ''
  const casos = bloqueo?.casosActivos ?? ajustador?.casosActivos ?? 0
  const bajaBloqueada = cambio?.tipo === 'baja' && casos > 0
  const reactivacionBloqueada = cambio?.tipo === 'reactivar' && ajustador?.aseguradora.eliminado
  const bloqueada = bajaBloqueada || reactivacionBloqueada

  async function confirmar() {
    if (!cambio || enviando || bloqueada) return
    setEnviando(true)
    setError(null)
    try {
      if (cambio.tipo === 'baja') {
        await darDeBajaAjustador(cambio.ajustador.id)
        onHecho(`Se dio de baja a ${nombre}.`)
      } else {
        await reactivarAjustador(cambio.ajustador.id)
        onHecho(`Se reactivó a ${nombre}.`)
      }
    } catch (err) {
      const datos = bloqueoBajaAjustadorSchema.safeParse(
        err instanceof ApiError ? err.detalles : null,
      )
      if (err instanceof ApiError && err.status === 409 && datos.success) {
        setBloqueoServidor(datos.data)
        onDesactualizado?.()
      } else {
        setError(err instanceof ApiError ? err.message : 'No se pudo completar. Probá de nuevo.')
      }
    } finally {
      setEnviando(false)
    }
  }

  let titulo = `¿Reactivar a ${nombre}?`
  let descripcion = 'Vuelve a estar disponible para asignarlo a siniestros.'
  if (bajaBloqueada) {
    titulo = `No se puede dar de baja a ${nombre}`
  } else if (reactivacionBloqueada) {
    titulo = `No se puede reactivar a ${nombre}`
    descripcion = `Su aseguradora, ${ajustador.aseguradora.nombre}, está dada de baja. Reactivala primero desde Aseguradoras.`
  } else if (cambio?.tipo === 'baja') {
    titulo = `¿Dar de baja a ${nombre}?`
    descripcion =
      'Deja de aparecer para asignarlo a siniestros nuevos. Sus siniestros se conservan y podés reactivarlo cuando quieras.'
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(abrir) => {
        if (!abrir && !enviando) {
          setError(null)
          setBloqueoServidor(null)
          onCerrar()
        }
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          const elemento = elementoAlCerrar?.()
          if (elemento) {
            event.preventDefault()
            elemento.focus()
          }
        }}
        // El foco arranca en la opción que no cambia nada
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          principal.current?.focus()
        }}
      >
        <DialogHeader>
          {bloqueada && (
            <span className="grid size-12 place-items-center rounded-full bg-warning-bg text-warning-ink">
              <TriangleAlert className="size-6" aria-hidden="true" />
            </span>
          )}
          <DialogTitle aria-live="polite">{titulo}</DialogTitle>
          <DialogDescription>
            {/* La cantidad en negrita, como en el mockup: es el dato que explica el bloqueo */}
            {bajaBloqueada ? (
              <>
                Tiene{' '}
                <strong className="text-foreground">
                  {casos === 1 ? '1 siniestro activo' : `${casos} siniestros activos`}
                </strong>{' '}
                asignado{casos === 1 ? '' : 's'}.{' '}
                {casos === 1
                  ? 'Asigná ese siniestro a otro ajustador antes de darlo de baja.'
                  : 'Asigná esos siniestros a otro ajustador antes de darlo de baja.'}
              </>
            ) : (
              descripcion
            )}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Aviso tipo="error" enfocar>
            {error}
          </Aviso>
        )}
        <DialogFooter>
          {bajaBloqueada ? (
            // Sin "Ver sus siniestros" hasta que exista el módulo de siniestros
            <DialogClose asChild>
              <Button ref={principal}>Entendido</Button>
            </DialogClose>
          ) : (
            <>
              <DialogClose asChild>
                <Button ref={principal} variant="outline" disabled={enviando}>
                  Cancelar
                </Button>
              </DialogClose>
              {reactivacionBloqueada ? (
                <Button asChild>
                  <Link to="/aseguradoras?bajas=1" onClick={onCerrar}>
                    Ir a aseguradoras <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              ) : (
                <Button
                  variant={cambio?.tipo === 'baja' ? 'destructive' : 'default'}
                  loading={enviando}
                  onClick={() => void confirmar()}
                >
                  {cambio?.tipo === 'baja' ? 'Dar de baja' : 'Reactivar'}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
