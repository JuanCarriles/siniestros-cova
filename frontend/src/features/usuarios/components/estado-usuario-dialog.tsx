import { useRef, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import {
  bloqueoBajaUsuarioSchema,
  motivoRestriccionUsuario,
  type UsuarioListado,
} from '@cova/shared/schemas/usuarios-abm'
import type { TipoUsuario } from '@cova/shared/schemas/enums'
import { SiniestrosActivosBaja } from '@/components/abm/siniestros-activos-baja'
import { useSiniestrosActivosBaja } from '@/components/abm/use-siniestros-activos-baja'
import { Aviso } from '@/components/aviso'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { ApiError } from '@/lib/api'
import { cambiarEstadoUsuario } from '../api/usuarios.api'

export type CambioEstadoUsuario = { usuario: UsuarioListado; tipo: 'baja' | 'reactivacion' }

export function EstadoUsuarioDialog({
  cambio,
  rol,
  onCerrar,
  onHecho,
  onDesactualizado,
  elementoAlCerrar,
}: {
  cambio: CambioEstadoUsuario | null
  rol: TipoUsuario
  onCerrar: () => void
  onHecho: (mensaje: string) => void
  onDesactualizado: () => void
  elementoAlCerrar: () => HTMLElement | null
}) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [casosServidor, setCasosServidor] = useState<number | null>(null)
  const principal = useRef<HTMLButtonElement>(null)
  const usuario = cambio?.usuario
  const nombre = usuario ? `${usuario.nombres} ${usuario.apellidos}` : ''
  const motivo = usuario ? motivoRestriccionUsuario(rol, usuario.tipoUsuario) : null
  const sinPermiso = motivo !== null
  const consulta = useSiniestrosActivosBaja({
    tipo: 'usuario',
    id: usuario?.id,
    habilitado: cambio?.tipo === 'baja' && !sinPermiso,
  })
  const casos = consulta.datos?.casosActivos ?? casosServidor ?? usuario?.casosActivos ?? 0
  const conCasos = cambio?.tipo === 'baja' && casos > 0
  const pendienteConsulta = cambio?.tipo === 'baja' && !sinPermiso && !consulta.verificada
  const bloqueada = sinPermiso || conCasos
  async function confirmar() {
    if (!cambio || enviando || bloqueada || pendienteConsulta) return
    setEnviando(true)
    setError(null)
    try {
      await cambiarEstadoUsuario(cambio.usuario.id, cambio.tipo)
      onHecho(`${cambio.tipo === 'baja' ? 'Se dio de baja a' : 'Se reactivó a'} ${nombre}.`)
    } catch (err) {
      const bloqueo = bloqueoBajaUsuarioSchema.safeParse(
        err instanceof ApiError ? err.detalles : null,
      )
      if (bloqueo.success) {
        setCasosServidor(bloqueo.data.casosActivos)
        consulta.actualizar()
        onDesactualizado()
      } else
        setError(err instanceof ApiError ? err.message : 'No se pudo completar. Probá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }
  return (
    <Dialog
      open={cambio !== null}
      onOpenChange={(abrir) => {
        if (!abrir && !enviando) onCerrar()
      }}
    >
      <DialogContent
        showCloseButton={!enviando}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          principal.current?.focus()
        }}
        onCloseAutoFocus={(e) => {
          const el = elementoAlCerrar()
          if (el) {
            e.preventDefault()
            el.focus()
          }
        }}
      >
        <DialogHeader>
          {bloqueada && (
            <span className="grid size-12 place-items-center rounded-full bg-warning-bg text-warning-ink">
              <TriangleAlert aria-hidden="true" />
            </span>
          )}
          <DialogTitle aria-live="polite">
            {bloqueada
              ? sinPermiso
                ? 'No podés administrar a este usuario'
                : 'No podés dar de baja a este usuario'
              : `¿${cambio?.tipo === 'baja' ? 'Dar de baja' : 'Reactivar'} a ${nombre}?`}
          </DialogTitle>
          <DialogDescription>
            {sinPermiso ? (
              motivo
            ) : conCasos ? (
              <>
                {nombre} tiene{' '}
                <strong className="text-foreground">
                  {casos} {casos === 1 ? 'caso activo' : 'casos activos'}
                </strong>
                . Reasigná sus casos antes de darlo de baja.
              </>
            ) : cambio?.tipo === 'baja' ? (
              'Se cerrarán sus sesiones y no podrá ingresar. Sus datos y sus casos se conservan.'
            ) : (
              'Podrá volver a ingresar con su contraseña actual.'
            )}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Aviso tipo="error" enfocar>
            {error}
          </Aviso>
        )}
        {cambio?.tipo === 'baja' && !sinPermiso && (
          <SiniestrosActivosBaja consulta={consulta} onAbrir={onCerrar} />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button ref={principal} variant={bloqueada ? 'default' : 'outline'} disabled={enviando}>
              {bloqueada ? 'Entendido' : 'Cancelar'}
            </Button>
          </DialogClose>
          {!bloqueada && (
            <Button
              variant={cambio?.tipo === 'baja' ? 'destructive' : 'default'}
              loading={enviando}
              disabled={pendienteConsulta}
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
