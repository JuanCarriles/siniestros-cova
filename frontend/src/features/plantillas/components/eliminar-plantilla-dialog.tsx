import { useRef, useState } from 'react'
import { TriangleAlert, Trash2 } from 'lucide-react'
import type { PlantillaListado } from '@cova/shared/schemas/plantillas'
import { Aviso } from '@/components/aviso'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { ApiError } from '@/lib/api'
import { eliminarPlantilla } from '../plantillas.api'

export function EliminarPlantillaDialog({
  plantilla,
  onCerrar,
  onHecho,
  elementoAlCerrar,
}: {
  plantilla: PlantillaListado
  onCerrar: () => void
  onHecho: (mensaje: string) => void
  elementoAlCerrar: (eliminada: boolean) => HTMLElement | null
}) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelar = useRef<HTMLButtonElement>(null)
  const eliminada = useRef(false)
  async function confirmar() {
    if (enviando) return
    setEnviando(true)
    setError(null)
    try {
      await eliminarPlantilla(plantilla.id)
      eliminada.current = true
      onHecho(
        `Se eliminó la plantilla «${plantilla.encabezado}». Los documentos ya generados se conservan.`,
      )
    } catch (error) {
      setError(
        error instanceof ApiError
          ? error.message
          : 'No se pudo eliminar la plantilla. Probá de nuevo.',
      )
      setEnviando(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !enviando) onCerrar()
      }}
    >
      <DialogContent
        showCloseButton={!enviando}
        onInteractOutside={(evento) => evento.preventDefault()}
        onOpenAutoFocus={(evento) => {
          evento.preventDefault()
          cancelar.current?.focus()
        }}
        onCloseAutoFocus={(evento) => {
          const elemento = elementoAlCerrar(eliminada.current)
          if (elemento) {
            evento.preventDefault()
            elemento.focus()
          }
        }}
      >
        <DialogHeader>
          <span className="grid size-12 place-items-center rounded-full bg-warning-bg text-warning-ink">
            <TriangleAlert className="size-6" aria-hidden="true" />
          </span>
          <DialogTitle>¿Eliminar esta plantilla?</DialogTitle>
          <DialogDescription>Vas a eliminar «{plantilla.encabezado}».</DialogDescription>
        </DialogHeader>
        <p className="rounded-lg border bg-surface-subtle px-4 py-3 break-all">
          {plantilla.nombreOriginal}
        </p>
        <div className="grid gap-2 rounded-lg border-2 border-danger-ink bg-danger-bg p-4 text-danger-ink">
          <p className="font-semibold">El borrado es definitivo.</p>
          <p>
            Se eliminarán la plantilla y su archivo almacenado. Esta acción no se puede deshacer.
          </p>
        </div>
        <p>
          Los documentos ya generados a partir de esta plantilla{' '}
          <strong>no se modifican ni se eliminan</strong>.
        </p>
        {error && (
          <Aviso tipo="error" enfocar>
            {error}
          </Aviso>
        )}
        <DialogFooter>
          <Button ref={cancelar} variant="outline" disabled={enviando} onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="destructive" loading={enviando} onClick={() => void confirmar()}>
            <Trash2 aria-hidden="true" />
            {enviando ? 'Eliminando…' : 'Eliminar definitivamente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
