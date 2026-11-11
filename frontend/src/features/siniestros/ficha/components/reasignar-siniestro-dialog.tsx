import { useEffect, useRef, useState } from 'react'
import { ArrowDown, RefreshCw, UserRoundCheck } from 'lucide-react'
import type { FichaSiniestro } from '@cova/shared/schemas/ficha-siniestro'
import type {
  OpcionesReasignacion,
  ResultadoReasignacion,
} from '@cova/shared/schemas/reasignacion-siniestro'
import { Aviso } from '@/components/aviso'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api, ApiError } from '@/lib/api'
import { AsignacionAlta } from '../../components/asignacion-alta'

export function ReasignarSiniestroDialog({
  ficha,
  onCerrar,
  onHecho,
  elementoAlCerrar,
}: {
  ficha: FichaSiniestro
  onCerrar: () => void
  elementoAlCerrar: () => HTMLElement | null
  onHecho: (resultado: ResultadoReasignacion, nombre: string) => void
}) {
  const [datos, setDatos] = useState<OpcionesReasignacion | null>(null)
  const [seleccion, setSeleccion] = useState<number | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const grupo = useRef<HTMLFieldSetElement>(null)
  const tituloConfirmacion = useRef<HTMLHeadingElement>(null)
  const nuevo = datos?.usuarios.find((u) => u.id === seleccion)
  useEffect(() => {
    const controlador = new AbortController()
    void api<OpcionesReasignacion>(`/siniestros/${ficha.id}/reasignacion`, {
      signal: controlador.signal,
    })
      .then((r) => {
        if (!controlador.signal.aborted) setDatos(r)
      })
      .catch((err: unknown) => {
        if (!controlador.signal.aborted)
          setError(
            err instanceof ApiError
              ? err.message
              : 'No se pudieron consultar los usuarios. Probá de nuevo.',
          )
      })
    return () => controlador.abort()
  }, [ficha.id, revision])
  useEffect(() => {
    if (confirmando) {
      const titulo = tituloConfirmacion.current
      titulo?.focus({ preventScroll: true })
      titulo?.closest('[data-slot="dialog-content"]')?.scrollTo({ top: 0 })
    }
  }, [confirmando])

  async function guardar(event: React.FormEvent) {
    event.preventDefault()
    if (!datos || !nuevo || enviando) return
    if (!confirmando) {
      setError(null)
      setConfirmando(true)
      return
    }
    setError(null)
    setEnviando(true)
    try {
      const resultado = await api<ResultadoReasignacion>(`/siniestros/${ficha.id}/reasignacion`, {
        method: 'PATCH',
        body: {
          idUsuarioAnterior: datos.anterior?.id ?? null,
          idUsuarioNuevo: nuevo.id,
          confirmado: true,
        },
      })
      onHecho(resultado, nuevo.nombre)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo reasignar. Revisá la conexión y probá de nuevo.',
      )
    } finally {
      setEnviando(false)
    }
  }
  function actualizar() {
    setDatos(null)
    setSeleccion(null)
    setConfirmando(false)
    setError(null)
    setRevision((r) => r + 1)
  }
  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !enviando) onCerrar()
      }}
    >
      <DialogContent
        size="wide"
        onCloseAutoFocus={(event) => {
          const elemento = elementoAlCerrar()
          if (elemento) {
            event.preventDefault()
            elemento.focus()
          }
        }}
        showCloseButton={!enviando}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Reasignar siniestro {ficha.numeroSiniestro}</DialogTitle>
          <DialogDescription>
            Elegí otro responsable. Se conservarán los datos y el historial del caso.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void guardar(e)} className="grid gap-5">
          {error && (
            <Aviso tipo="error" enfocar>
              {error}
            </Aviso>
          )}
          {!datos ? (
            <p role="status">
              {error
                ? 'Podés actualizar la lista para volver a intentarlo.'
                : 'Consultando usuarios y casos activos…'}
            </p>
          ) : confirmando && nuevo ? (
            <section className="grid gap-4">
              <h3
                ref={tituloConfirmacion}
                tabIndex={-1}
                className="text-xl font-bold text-primary focus-visible:outline-none"
              >
                ¿Confirmás la reasignación?
              </h3>
              <div className="grid gap-2 rounded-xl border-2 border-assignment-border bg-assignment-bg p-4 sm:p-5">
                <p className="text-muted-foreground">Responsable actual</p>
                <p className="text-lg font-bold">{datos.anterior?.nombre ?? 'Sin responsable'}</p>
                <ArrowDown className="my-1 size-6 text-primary" aria-hidden="true" />
                <p className="text-muted-foreground">Nuevo responsable</p>
                <p className="text-lg font-bold text-primary">{nuevo.nombre}</p>
                <p>
                  {nuevo.casosActivos}{' '}
                  {nuevo.casosActivos === 1
                    ? 'caso activo actualmente'
                    : 'casos activos actualmente'}
                </p>
              </div>
              <Aviso tipo="info">
                Se registrarán tu nombre y la fecha en el historial. El responsable anterior y el
                nuevo recibirán un aviso en el sistema. Solo el nuevo responsable recibirá también
                un mail.
              </Aviso>
            </section>
          ) : (
            <>
              <div className="rounded-lg border bg-surface-subtle p-4">
                <p className="text-sm text-muted-foreground">Responsable actual</p>
                <p className="text-lg font-bold">{datos.anterior?.nombre ?? 'Sin responsable'}</p>
              </div>
              {datos.usuarios.length ? (
                <AsignacionAlta
                  usuarios={datos.usuarios}
                  valor={seleccion}
                  onCambiar={setSeleccion}
                  error={null}
                  grupoRef={grupo}
                  titulo="Nuevo responsable"
                  leyenda="¿A quién querés reasignarlo?"
                  descripcion="Usuarios activos y cantidad de casos abiertos asignados. El responsable actual no aparece entre las opciones."
                />
              ) : (
                <Aviso tipo="info">
                  No hay otros usuarios activos disponibles para recibir el siniestro.
                </Aviso>
              )}
            </>
          )}
          <DialogFooter className="gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={enviando}
              onClick={() => {
                if (!confirmando) return onCerrar()
                setConfirmando(false)
                setError(null)
                requestAnimationFrame(() => grupo.current?.focus())
              }}
            >
              {confirmando ? 'Volver a elegir' : 'Cancelar'}
            </Button>
            {error && (
              <Button type="button" variant="outline" disabled={enviando} onClick={actualizar}>
                <RefreshCw aria-hidden="true" />
                Actualizar lista
              </Button>
            )}
            <Button type="submit" disabled={!nuevo} loading={enviando}>
              <UserRoundCheck aria-hidden="true" />
              {confirmando ? 'Confirmar reasignación' : 'Revisar reasignación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
