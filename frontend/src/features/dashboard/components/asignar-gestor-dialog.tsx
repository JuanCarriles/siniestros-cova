import { useEffect, useRef, useState } from 'react'
import type { CasoDashboard } from '@cova/shared/schemas/dashboard'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { asignarGestorDashboard, obtenerGestoresDashboard } from '../api/dashboard.api'

export function AsignarGestorDialog({
  caso,
  onCerrar,
  onHecho,
  onDesactualizado,
}: {
  caso: CasoDashboard
  onCerrar: () => void
  onHecho: (mensaje: string) => void
  onDesactualizado: () => void
}) {
  const [gestores, setGestores] = useState<{ id: number; nombre: string }[]>([])
  const [cargando, setCargando] = useState(true)
  const [idUsuario, setIdUsuario] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [conflicto, setConflicto] = useState(false)
  const ocupado = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    obtenerGestoresDashboard(controller.signal)
      .then((datos) => {
        if (!controller.signal.aborted) setGestores(datos)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : 'No se pudieron cargar los gestores.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargando(false)
      })
    return () => controller.abort()
  }, [])
  async function confirmar(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!idUsuario || ocupado.current || conflicto) return
    ocupado.current = true
    setEnviando(true)
    setError(null)
    try {
      await asignarGestorDashboard(caso.id, Number(idUsuario))
      onHecho(
        `Se asignó el siniestro ${caso.numeroSiniestro} a ${gestores.find((g) => g.id === Number(idUsuario))?.nombre ?? 'su gestor'}.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo asignar el gestor. Probá de nuevo.')
      if (err instanceof ApiError && [404, 409].includes(err.status)) {
        setConflicto(true)
        onDesactualizado()
      }
    } finally {
      ocupado.current = false
      setEnviando(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !ocupado.current) onCerrar()
      }}
    >
      <DialogContent
        onEscapeKeyDown={(e) => {
          if (ocupado.current) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (ocupado.current) e.preventDefault()
        }}
      >
        <form
          onSubmit={(e) => {
            void confirmar(e)
          }}
          className="space-y-6"
        >
          <DialogHeader>
            <DialogTitle>Asignar gestor</DialogTitle>
            <DialogDescription>
              Elegí quién será responsable del siniestro <strong>{caso.numeroSiniestro}</strong>, de{' '}
              {caso.aseguradora}. La asignación quedará registrada en el historial.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Aviso tipo="error" enfocar>
              {error}
            </Aviso>
          )}
          {cargando ? (
            <p role="status">Cargando gestores activos…</p>
          ) : gestores.length === 0 ? (
            <Aviso tipo="info">
              No hay gestores activos disponibles. Revisá los usuarios del sistema y volvé a abrir
              este formulario.
            </Aviso>
          ) : (
            <div className="space-y-2">
              <label htmlFor="gestor-dashboard" className="block font-semibold">
                Gestor responsable{' '}
                <span className="font-normal text-muted-foreground">(obligatorio)</span>
              </label>
              <Select
                value={idUsuario}
                onValueChange={setIdUsuario}
                disabled={enviando || conflicto}
              >
                <SelectTrigger
                  id="gestor-dashboard"
                  className="w-full"
                  aria-describedby="gestor-dashboard-ayuda"
                >
                  <SelectValue placeholder="Seleccioná un gestor" />
                </SelectTrigger>
                <SelectContent>
                  {gestores.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id="gestor-dashboard-ayuda" className="text-muted-foreground">
                Solo se muestran usuarios activos de tipo gestor.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!idUsuario || cargando || enviando || conflicto}>
              {enviando ? 'Asignando…' : 'Asignar gestor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
