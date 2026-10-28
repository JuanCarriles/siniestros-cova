import { useRef, useState } from 'react'
import { CircleMinus, RotateCcw, Trash2, TriangleAlert } from 'lucide-react'
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
import { darDeBajaSiniestro, eliminarSiniestro, reactivarSiniestro } from '../api/siniestros.api'

export type OperacionSiniestro = {
  tipo: 'baja' | 'reactivar' | 'eliminar'
  siniestro: SiniestroListado
}
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
  const reactivacion = tipo === 'reactivar'
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
    if (enviando || (permanente && (!coincide || !datos.success))) return
    setEnviando(true)
    setError(null)
    try {
      if (permanente && datos.success) await eliminarSiniestro(siniestro.id, datos.data)
      else if (reactivacion) await reactivarSiniestro(siniestro.id)
      else await darDeBajaSiniestro(siniestro.id)
      completado.current = true
      onHecho(
        permanente
          ? `Se eliminó definitivamente el siniestro ${siniestro.numeroSiniestro}, sus registros asociados y sus archivos.`
          : reactivacion
            ? `Se reactivó el siniestro ${siniestro.numeroSiniestro}. Volvió al listado habitual y la operación quedó registrada en el historial.`
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
          ? 'La eliminación quedó pendiente. El siniestro conserva sus registros. Reintentá para terminarla.'
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
            {permanente
              ? '¿Eliminar definitivamente el siniestro?'
              : reactivacion
                ? '¿Reactivar el siniestro?'
                : '¿Dar de baja el siniestro?'}
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
              El siniestro está dado de baja y en estado <strong>{siniestro.estado.nombre}</strong>.
              Confirmá únicamente si querés borrar todo el expediente.
            </p>
          </>
        ) : reactivacion ? (
          <p>
            El siniestro volverá al listado habitual con sus datos y archivos conservados. No se
            cambia su estado de gestión. Se registrarán el usuario y la fecha de reactivación en el
            historial.
          </p>
        ) : siniestro.eliminacionEnCurso ? (
          <p>
            Este siniestro ya tiene una eliminación definitiva pendiente. La baja permitirá
            reintentar el borrado; no podrá reactivarse porque puede haber archivos eliminados.
          </p>
        ) : (
          <p>
            Se conservarán sus datos y archivos, pero dejará de aparecer en el listado habitual.
            Podrás consultarlo y reactivarlo con <strong>Mostrar dados de baja</strong>. Se
            registrarán el usuario y la fecha en el historial.
          </p>
        )}
        <form
          className="grid gap-5"
          onSubmit={(e) => void confirmar(e)}
          noValidate
          aria-busy={enviando}
        >
          {permanente && (
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
          )}
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
            <Button
              type="submit"
              variant={reactivacion ? 'default' : 'destructive'}
              disabled={permanente && !coincide}
              loading={enviando}
            >
              {permanente ? (
                <Trash2 aria-hidden="true" />
              ) : reactivacion ? (
                <RotateCcw aria-hidden="true" />
              ) : (
                <CircleMinus aria-hidden="true" />
              )}
              {permanente ? 'Eliminar definitivamente' : reactivacion ? 'Reactivar' : 'Dar de baja'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
