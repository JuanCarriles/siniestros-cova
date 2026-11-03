import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { FichaSiniestro } from '@cova/shared/schemas/ficha-siniestro'
import {
  opcionesCambioEstadoSchema,
  type OpcionesCambioEstado,
} from '@cova/shared/schemas/cambio-estado-siniestro'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { Aviso } from '@/components/aviso'
import { EstadoChip } from '@/components/estado-chip'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

export function CambiarEstadoDialog({
  ficha,
  onCerrar,
  onHecho,
}: {
  ficha: FichaSiniestro
  onCerrar: () => void
  onHecho: (mensaje: string) => void
}) {
  const titulo = useRef<HTMLHeadingElement>(null)
  const [datos, setDatos] = useState<OpcionesCambioEstado | null>(null)
  const [seleccion, setSeleccion] = useState<number | null>(null)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => {
    const controlador = new AbortController()
    void api(`/siniestros/${ficha.id}/estados`, { signal: controlador.signal })
      .then((respuesta) => {
        if (!controlador.signal.aborted) setDatos(opcionesCambioEstadoSchema.parse(respuesta))
      })
      .catch((err: unknown) => {
        if (!controlador.signal.aborted)
          setError(
            err instanceof ApiError
              ? err.message
              : 'No se pudieron consultar los estados. Probá de nuevo.',
          )
      })
    return () => controlador.abort()
  }, [ficha.id, revision])
  const nuevo = datos?.estados.find((e) => e.id === seleccion)
  async function confirmar(event: FormEvent) {
    event.preventDefault()
    if (!datos || !nuevo || enviando) return
    setEnviando(true)
    setError(null)
    try {
      await api(`/siniestros/${ficha.id}/estado`, {
        method: 'PATCH',
        body: {
          idEstadoAnterior: datos.estadoActual.id,
          idEstadoSiniestro: nuevo.id,
        },
      })
      onHecho(
        `El siniestro ${ficha.numeroSiniestro} pasó a ${nuevo.nombre}. El cambio quedó registrado y se notificó a los usuarios involucrados.`,
      )
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo cambiar el estado. Probá de nuevo.',
      )
    } finally {
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
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          titulo.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle ref={titulo} tabIndex={-1}>
            Cambiar estado
          </DialogTitle>
          <DialogDescription>
            Elegí el nuevo estado del siniestro {ficha.numeroSiniestro}. El cambio quedará en su
            historial.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Aviso tipo="error" enfocar>
            {error}
          </Aviso>
        )}
        <form onSubmit={(event) => void confirmar(event)} className="grid gap-4">
          {!datos ? (
            <p role="status">
              {error
                ? 'Revisá el mensaje y volvé a consultar.'
                : 'Consultando estados disponibles…'}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-surface-subtle p-3">
                <span className="font-semibold">Estado actual</span>
                <EstadoChip estado={datos.estadoActual.nombre} />
              </div>
              <fieldset disabled={enviando} className="grid gap-2">
                <legend className="mb-2 font-bold">Nuevo estado</legend>
                <p className="mb-1 text-sm text-muted-foreground">
                  Pasá el mouse por un estado o seleccionalo para leer su explicación.
                </p>
                {datos.estados
                  .filter((e) => e.id !== datos.estadoActual.id)
                  .map((estado) => (
                    <Tooltip key={estado.id}>
                      <TooltipTrigger asChild>
                        <label
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-lg border-2 px-3 py-3 transition-colors focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ring hover:bg-accent',
                            seleccion === estado.id ? 'border-primary bg-info-bg' : 'border-line',
                          )}
                        >
                          <input
                            type="radio"
                            name="estado"
                            value={estado.id}
                            checked={seleccion === estado.id}
                            onChange={() => setSeleccion(estado.id)}
                            aria-describedby={`explicacion-estado-${estado.id}`}
                            className="mt-1 size-5 shrink-0 accent-primary"
                          />
                          <span className="grid min-w-0 gap-1">
                            <span className="font-bold">{estado.nombre}</span>
                            <span
                              id={`explicacion-estado-${estado.id}`}
                              className={cn(
                                'text-base text-muted-foreground',
                                seleccion !== estado.id && 'sr-only',
                              )}
                            >
                              {estado.descripcion}
                            </span>
                          </span>
                        </label>
                      </TooltipTrigger>
                      <TooltipContent>{estado.descripcion}</TooltipContent>
                    </Tooltip>
                  ))}
                {datos.estados.every((e) => e.id === datos.estadoActual.id) && (
                  <p>No hay otros estados disponibles. Consultá a la administración del sistema.</p>
                )}
              </fieldset>
              {nuevo && (
                <p role="status" className="flex flex-wrap items-center gap-2 font-semibold">
                  {datos.estadoActual.nombre}
                  <ArrowRight className="size-5" aria-hidden="true" />
                  {nuevo.nombre}
                </p>
              )}
              {nuevo?.esCierre && (
                <Aviso tipo="info">Este estado cierra el caso y registra la fecha de cierre.</Aviso>
              )}
              <p className="text-sm text-muted-foreground">
                Se avisará al usuario asignado y a los administradores activos, excepto a quien
                realiza el cambio.
              </p>
            </>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={enviando}>
                Cancelar
              </Button>
            </DialogClose>
            {error && (
              <Button
                type="button"
                variant="outline"
                disabled={enviando}
                onClick={() => {
                  setDatos(null)
                  setSeleccion(null)
                  setError(null)
                  setRevision((actual) => actual + 1)
                }}
              >
                <RefreshCw aria-hidden="true" />
                Consultar de nuevo
              </Button>
            )}
            <Button type="submit" disabled={!nuevo} loading={enviando}>
              Confirmar cambio
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
