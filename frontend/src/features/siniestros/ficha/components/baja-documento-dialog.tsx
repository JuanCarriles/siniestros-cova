import { useId, useRef } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { DocumentoFicha } from '@cova/shared/schemas/ficha-siniestro'
import { bajaDocumentoSchema, type BajaDocumento } from '@cova/shared/schemas/documentos'
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
  const id = useId()
  const campoId = `${id}-motivo`
  const ayudaId = `${id}-ayuda`
  const contadorId = `${id}-contador`
  const errorId = `${id}-error`
  const pendiente = useRef(false)
  const {
    register,
    control,
    handleSubmit,
    setFocus,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BajaDocumento>({
    resolver: zodResolver(bajaDocumentoSchema),
    defaultValues: { motivo: '' },
  })
  const motivo = useWatch({ control, name: 'motivo' })
  async function confirmar(datos: BajaDocumento) {
    if (pendiente.current) return
    pendiente.current = true
    try {
      await api(`/siniestros/${idSiniestro}/documentos/${documento.id}/baja`, {
        method: 'PATCH',
        body: datos,
      })
      onHecho()
    } catch (err) {
      setError('root', {
        message:
          err instanceof ApiError
            ? err.message
            : 'No se pudo dar de baja el documento. Probá de nuevo.',
      })
      if (err instanceof ApiError && [403, 404, 409].includes(err.status)) onDesactualizado()
    } finally {
      pendiente.current = false
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
        showCloseButton={!isSubmitting}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          setFocus('motivo')
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
          <DialogTitle>Dar de baja el documento</DialogTitle>
          <DialogDescription>Vas a dar de baja «{documento.nombreOriginal}».</DialogDescription>
        </DialogHeader>
        <p className="rounded-lg border bg-surface-subtle p-4">
          Dejará de aparecer entre los documentos activos. Podrás consultarlo con el filtro de dados
          de baja. La baja quedará registrada con tu nombre, la fecha y el motivo.
        </p>
        <form noValidate onSubmit={(e) => void handleSubmit(confirmar)(e)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={campoId}>Motivo de la baja (obligatorio)</Label>
            <Textarea
              {...register('motivo')}
              id={campoId}
              required
              maxLength={1000}
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.motivo)}
              aria-describedby={`${ayudaId} ${contadorId}${errors.motivo ? ` ${errorId}` : ''}`}
            />
            <p id={ayudaId} className="text-muted-foreground">
              Explicá por qué se retira del expediente.
            </p>
            <p id={contadorId} className="text-right dato text-muted-foreground">
              {motivo.length} / 1000 caracteres
            </p>
            {errors.motivo?.message && (
              <p id={errorId} role="alert" className="font-semibold text-destructive">
                {errors.motivo.message}
              </p>
            )}
          </div>
          {errors.root?.message && (
            <Aviso tipo="error" enfocar>
              {errors.root.message}
            </Aviso>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" loading={isSubmitting}>
              <ArchiveX aria-hidden="true" />
              Confirmar baja
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
