import { useRef, useState } from 'react'
import { CircleMinus, Trash2, TriangleAlert } from 'lucide-react'
import { confirmarSiniestroSchema, type SiniestroListado } from '@cova/shared/schemas/siniestros'
import { Aviso } from '@/components/aviso'
import { TextField } from '@/components/text-field'
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
import { darDeBajaSiniestro, eliminarSiniestro } from '../api/siniestros.api'

export type OperacionSiniestro = { tipo: 'baja' | 'eliminar'; siniestro: SiniestroListado }
export function OperacionSiniestroDialog({
  operacion,
  onCerrar,
  onHecho,
  onDesactualizado,
  elementoAlCerrar,
}: {
  operacion: OperacionSiniestro
  onCerrar: () => void
  onHecho: (mensaje: string) => void
  onDesactualizado: () => void
  elementoAlCerrar: (completado: boolean) => HTMLElement | null
}) {
  const { tipo, siniestro } = operacion
  const permanente = tipo === 'eliminar'
  const [numero, setNumero] = useState('')
  const [revisado, setRevisado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelar = useRef<HTMLButtonElement>(null)
  const completado = useRef(false)
  const coincide = numero.trim() === siniestro.numeroSiniestro
  async function confirmar(evento: React.SubmitEvent<HTMLFormElement>) {
    evento.preventDefault()
    setRevisado(true)
    const datos = confirmarSiniestroSchema.safeParse({ numeroSiniestro: numero })
    if (enviando || !coincide || !datos.success) return
    setEnviando(true)
    setError(null)
    try {
      if (permanente) await eliminarSiniestro(siniestro.id, datos.data)
      else await darDeBajaSiniestro(siniestro.id, datos.data)
      completado.current = true
      onHecho(
        permanente
          ? `Se eliminó definitivamente el siniestro ${siniestro.numeroSiniestro}, sus registros asociados y sus archivos.`
          : `Se dio de baja el siniestro ${siniestro.numeroSiniestro}. La fecha y el usuario quedaron registrados en el historial.`,
      )
    } catch (fallo) {
      const codigo =
        fallo instanceof ApiError &&
        fallo.detalles &&
        typeof fallo.detalles === 'object' &&
        'codigo' in fallo.detalles
          ? fallo.detalles.codigo
          : null
      setError(
        codigo === 'ELIMINACION_SINIESTRO_PENDIENTE'
          ? 'No se pudieron eliminar todos los archivos. El siniestro conserva sus registros y podés reintentar la eliminación.'
          : fallo instanceof ApiError
            ? fallo.message
            : 'No se pudo completar la operación. Probá de nuevo.',
      )
      setEnviando(false)
      onDesactualizado()
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
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          cancelar.current?.focus()
        }}
        onCloseAutoFocus={(e) => {
          const elemento = elementoAlCerrar(completado.current)
          if (elemento) {
            e.preventDefault()
            elemento.focus()
          }
        }}
      >
        <DialogHeader>
          <span className="grid size-12 place-items-center rounded-full bg-warning-bg text-warning-ink">
            <TriangleAlert className="size-6" aria-hidden="true" />
          </span>
          <DialogTitle>
            {permanente ? '¿Eliminar definitivamente el siniestro?' : '¿Dar de baja el siniestro?'}
          </DialogTitle>
          <DialogDescription>
            Siniestro <strong className="dato">{siniestro.numeroSiniestro}</strong> ·{' '}
            {siniestro.aseguradora.nombre}
          </DialogDescription>
        </DialogHeader>
        {permanente ? (
          <>
            <div className="grid gap-2 rounded-lg border-2 border-danger-ink bg-danger-bg p-4 text-danger-ink">
              <p className="font-semibold">El borrado es permanente y no se puede deshacer.</p>
              <p>
                Se eliminarán el siniestro y sus vehículos, personas, documentos y archivos,
                novedades, mensajes y lecturas, peritos, notificaciones e historial asociados.
              </p>
            </div>
            <p>
              Solo se permite en estado <strong>Cierre enviado</strong>. Confirmá únicamente si
              querés borrar todo el expediente.
            </p>
          </>
        ) : (
          <p>
            Se conservarán sus datos y archivos, pero dejará de aparecer en el listado habitual.
            Podrás consultarlo con <strong>Mostrar dados de baja</strong>. Se registrarán el usuario
            y la fecha en el historial.
          </p>
        )}
        <form
          className="grid gap-5"
          onSubmit={(e) => void confirmar(e)}
          noValidate
          aria-busy={enviando}
        >
          <TextField
            label="Escribí el número de siniestro para confirmar"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            onBlur={() => setRevisado(true)}
            required
            disabled={enviando}
            autoComplete="off"
            maxLength={255}
            hint={`Ingresá ${siniestro.numeroSiniestro} exactamente como aparece arriba.`}
            error={
              revisado && !coincide
                ? 'El número ingresado no coincide con el siniestro.'
                : undefined
            }
          />
          {error && (
            <Aviso tipo="error" enfocar>
              {error}
            </Aviso>
          )}
          <DialogFooter>
            <Button
              ref={cancelar}
              type="button"
              variant="outline"
              disabled={enviando}
              onClick={onCerrar}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={!coincide} loading={enviando}>
              {permanente ? <Trash2 aria-hidden="true" /> : <CircleMinus aria-hidden="true" />}
              {enviando
                ? permanente
                  ? 'Eliminando…'
                  : 'Dando de baja…'
                : permanente
                  ? 'Eliminar definitivamente'
                  : 'Dar de baja'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
