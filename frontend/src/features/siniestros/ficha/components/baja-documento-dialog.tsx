import { useRef, useState } from 'react'
import type { DocumentoFicha } from '@cova/shared/schemas/ficha-siniestro'
import { bajaDocumentoSchema } from '@cova/shared/schemas/documentos'
import { ArchiveX } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { Aviso } from '@/components/aviso'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

export function BajaDocumentoDialog({
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
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const pendiente = useRef(false)
  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    if (pendiente.current) return
    const datos = bajaDocumentoSchema.safeParse({ motivo })
    if (!datos.success) {
      setError(datos.error.issues[0].message)
      return
    }
    pendiente.current = true
    setEnviando(true)
    setError('')
    try {
      await api(`/siniestros/${idSiniestro}/documentos/${documento.id}/baja`, {
        method: 'PATCH',
        body: datos.data,
      })
      onHecho()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo dar de baja el documento. Probá de nuevo.',
      )
      if (err instanceof ApiError && [403, 404, 409].includes(err.status)) onDesactualizado()
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
          <DialogTitle>Dar de baja el documento</DialogTitle>
          <DialogDescription>Vas a dar de baja «{documento.nombreOriginal}».</DialogDescription>
        </DialogHeader>
        <p className="rounded-lg border bg-surface-subtle p-4">
          Dejará de aparecer en la grilla. El archivo se conserva y la baja quedará registrada con
          tu nombre, la fecha y el motivo.
        </p>
        <form onSubmit={(e) => void confirmar(e)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="motivo-baja-documento">Motivo de la baja (obligatorio)</Label>
            <Textarea
              id="motivo-baja-documento"
              autoFocus
              required
              maxLength={1000}
              value={motivo}
              disabled={enviando}
              onChange={(e) => setMotivo(e.target.value)}
              aria-describedby="ayuda-motivo-documento"
            />
            <p id="ayuda-motivo-documento" className="text-muted-foreground">
              Explicá por qué se retira del expediente. Hasta 1000 caracteres.
            </p>
          </div>
          {error && (
            <Aviso tipo="error" enfocar>
              {error}
            </Aviso>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={enviando} onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" loading={enviando}>
              <ArchiveX aria-hidden="true" />
              Confirmar baja
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
