import { useRef, useState } from 'react'
import type { AseguradoraListado } from '@cova/shared/schemas/aseguradoras'
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
import { darDeBajaAseguradora, reactivarAseguradora } from '../api/aseguradoras.api'

export type CambioEstado = { tipo: 'baja' | 'reactivar'; aseguradora: AseguradoraListado }

// CU-02 3.a (baja) y 3.c (reactivar): ambas piden confirmación. Si tiene ajustadores activos, en lugar de
// confirmar explica por qué no se puede y qué hacer (el backend también lo rechaza).
export function EstadoAseguradoraDialog({
  abierto,
  elementoAlCerrar,
  cambio,
  onCerrar,
  onHecho,
}: {
  /** Separado de "cambio": al cerrar, el contenido no cambia durante la animación de salida */
  abierto: boolean
  /** Dónde poner el foco al cerrar (el ⋮ de la fila); sin él, Radix lo devuelve a lo que estaba enfocado */
  elementoAlCerrar?: () => HTMLElement | null
  cambio: CambioEstado | null
  onCerrar: () => void
  onHecho: (mensaje: string) => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelar = useRef<HTMLButtonElement>(null)

  const nombre = cambio?.aseguradora.nombre ?? ''
  const ajustadores = cambio?.aseguradora.cantidadAjustadores ?? 0
  const bloqueada = cambio?.tipo === 'baja' && ajustadores > 0

  async function confirmar() {
    if (!cambio) return
    setEnviando(true)
    setError(null)
    try {
      if (cambio.tipo === 'baja') {
        await darDeBajaAseguradora(cambio.aseguradora.id)
        onHecho(`Se dio de baja la aseguradora ${nombre}.`)
      } else {
        await reactivarAseguradora(cambio.aseguradora.id)
        onHecho(`Se reactivó la aseguradora ${nombre}.`)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo completar. Probá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(abrir) => {
        if (!abrir && !enviando) {
          setError(null)
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
          cancelar.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {bloqueada
              ? `No se puede dar de baja ${nombre}`
              : cambio?.tipo === 'baja'
                ? `¿Dar de baja ${nombre}?`
                : `¿Reactivar ${nombre}?`}
          </DialogTitle>
          <DialogDescription>
            {bloqueada
              ? `Tiene ${ajustadores} ${ajustadores === 1 ? 'ajustador activo' : 'ajustadores activos'}. Primero dalos de baja o pasalos a otra aseguradora desde Ajustadores.`
              : cambio?.tipo === 'baja'
                ? 'No se va a poder elegir para ajustadores ni siniestros nuevos. Sus siniestros se conservan y podés reactivarla cuando quieras.'
                : 'Vuelve a estar disponible para asignar ajustadores y siniestros.'}
          </DialogDescription>
        </DialogHeader>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <DialogFooter>
          <DialogClose asChild>
            <Button ref={cancelar} variant="outline" disabled={enviando}>
              {bloqueada ? 'Entendido' : 'Cancelar'}
            </Button>
          </DialogClose>
          {!bloqueada && (
            <Button
              variant={cambio?.tipo === 'baja' ? 'destructive' : 'default'}
              loading={enviando}
              onClick={() => void confirmar()}
            >
              {cambio?.tipo === 'baja' ? 'Dar de baja' : 'Reactivar'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
