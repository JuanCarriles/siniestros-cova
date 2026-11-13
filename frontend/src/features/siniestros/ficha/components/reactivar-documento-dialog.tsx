import { useRef, useState } from 'react'
import type { DocumentoFicha } from '@cova/shared/schemas/ficha-siniestro'
import { ArchiveRestore } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
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

export function ReactivarDocumentoDialog({
  documento,
  idSiniestro,
  onCerrar,
  onHecho,
  onDesactualizado,
}: {
  documento: DocumentoFicha
  idSiniestro: number
  onCerrar: () => void
  onHecho: () => void
  onDesactualizado: () => void
}) {
  const pendiente = useRef(false)
  const cancelar = useRef<HTMLButtonElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  async function confirmar() {
    if (pendiente.current) return
    pendiente.current = true
    setEnviando(true)
    setError('')
    try {
      await api(`/siniestros/${idSiniestro}/documentos/${documento.id}/reactivacion`, {
        method: 'PATCH',
      })
      onHecho()
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : 'No se pudo reactivar el documento. Probá de nuevo.',
      )
      if (e instanceof ApiError && [403, 404, 409].includes(e.status)) onDesactualizado()
    } finally {
      pendiente.current = false
      setEnviando(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !pendiente.current) onCerrar()
      }}
    >
      <DialogContent
        showCloseButton={!enviando}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          cancelar.current?.focus()
        }}
        onEscapeKeyDown={(e) => {
          if (pendiente.current) e.preventDefault()
        }}
        onInteractOutside={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          const titulo = document.getElementById('titulo-pestana')
          if (titulo) {
            e.preventDefault()
            titulo.focus()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Reactivar documento</DialogTitle>
          <DialogDescription>Vas a reactivar «{documento.nombreOriginal}».</DialogDescription>
        </DialogHeader>
        <p className="rounded-lg border bg-surface-subtle p-4">
          Volverá a mostrarse entre los documentos activos. Se conserva su fecha de carga original y
          la reactivación quedará registrada en el historial.
        </p>
        {documento.motivoBaja && (
          <p className="break-words">
            <strong>Motivo de la baja:</strong> {documento.motivoBaja}
          </p>
        )}
        {error && (
          <Aviso tipo="error" enfocar>
            {error}
          </Aviso>
        )}
        <DialogFooter>
          <Button ref={cancelar} variant="outline" disabled={enviando} onClick={onCerrar}>
            Cancelar
          </Button>
          <Button loading={enviando} onClick={() => void confirmar()}>
            <ArchiveRestore aria-hidden="true" />
            Confirmar reactivación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
