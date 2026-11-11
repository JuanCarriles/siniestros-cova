import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowUpRight, Check, CheckCheck, Eye, Mail, MailOpen, RotateCcw } from 'lucide-react'
import type { NotificacionBandeja } from '@cova/shared/schemas/bandeja-notificaciones'
import { Aviso } from '@/components/aviso'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import { fechaHoraDe } from '@/features/siniestros/ficha/formato'
import { marcarLectura, marcarRevision } from './api'
import { actualizarNotificaciones } from './actualizar-notificaciones'
import { tiposNotificacion } from './tipos'

export function ListaNotificaciones({
  items,
  basePath,
  compacta = false,
  onCambio,
  onAbrir,
}: {
  items: NotificacionBandeja[]
  basePath: string
  compacta?: boolean
  onCambio: (id: number, cambios: { leida?: boolean; revisada?: boolean }) => void
  onAbrir?: () => void
}) {
  const navigate = useNavigate()
  const [ocupada, setOcupada] = useState<number | null>(null)
  const [error, setError] = useState('')
  async function actuar(aviso: NotificacionBandeja, accion: 'abrir' | 'leer' | 'revisar') {
    if (ocupada !== null) return
    setOcupada(aviso.id)
    setError('')
    try {
      if (accion === 'abrir') {
        if (!aviso.puedeAbrirSiniestro) return
        // Esperar la revisión antes de navegar: un error queda visible, sin abrir otro destino.
        await marcarRevision(aviso.id, true)
        onCambio(aviso.id, { leida: true, revisada: true })
        actualizarNotificaciones()
        onAbrir?.()
        await navigate(`${basePath}/siniestros/${aviso.siniestro.id}`)
      } else if (accion === 'leer') {
        await marcarLectura(aviso.id, !aviso.leida)
        onCambio(aviso.id, { leida: !aviso.leida })
        actualizarNotificaciones()
      } else {
        await marcarRevision(aviso.id, !aviso.revisada)
        onCambio(aviso.id, {
          revisada: !aviso.revisada,
          ...(!aviso.revisada ? { leida: true } : {}),
        })
        actualizarNotificaciones()
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo guardar el cambio. Probá de nuevo.',
      )
    } finally {
      setOcupada(null)
    }
  }
  return (
    <div className="min-w-0">
      {error && (
        <Aviso tipo="error" enfocar className="m-3">
          {error}
        </Aviso>
      )}
      <ul aria-label="Lista de notificaciones" className="divide-y-2 divide-line">
        {items.map((aviso) => {
          const tipo = tiposNotificacion[aviso.tipo]
          const Icono = tipo.icono
          return (
            <li
              key={aviso.id}
              className={cn(
                'min-w-0 border-l-4 p-4 sm:p-5',
                aviso.leida ? 'border-l-transparent bg-surface' : 'border-l-primary bg-info-bg/40',
              )}
            >
              <div className="flex min-w-0 gap-3 sm:gap-4">
                <span
                  className={cn(
                    'mt-1 grid size-11 shrink-0 place-items-center rounded-xl',
                    tipo.color,
                  )}
                >
                  <Icono className="size-6" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1',
                      compacta && 'flex-col items-start',
                    )}
                  >
                    <p className="font-semibold text-muted-foreground">{tipo.etiqueta}</p>
                    <time className="dato text-sm text-muted-foreground" dateTime={aviso.fecha}>
                      {fechaHoraDe(aviso.fecha)}
                    </time>
                  </div>
                  <button
                    type="button"
                    onClick={() => void actuar(aviso, 'abrir')}
                    disabled={ocupada !== null || !aviso.puedeAbrirSiniestro}
                    aria-label={`Abrir notificación del siniestro ${aviso.siniestro.numeroSiniestro}`}
                    className="group grid min-h-12 w-full gap-1 rounded-md text-left focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-default"
                  >
                    <span className="flex items-center gap-2 font-bold text-primary">
                      <span className="dato break-all">
                        Siniestro {aviso.siniestro.numeroSiniestro}
                      </span>
                      {aviso.puedeAbrirSiniestro && (
                        <ArrowUpRight className="size-5 shrink-0" aria-hidden="true" />
                      )}
                    </span>
                    <span className="block leading-relaxed [overflow-wrap:anywhere] break-words text-foreground">
                      {aviso.mensaje}
                    </span>
                  </button>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant={aviso.leida ? 'neutral' : 'info'}>
                      {aviso.leida ? <MailOpen /> : <Mail />}
                      {aviso.leida ? 'Leída' : 'Sin leer'}
                    </Badge>
                    <Badge variant={aviso.revisada ? 'success' : 'warning'}>
                      {aviso.revisada ? <CheckCheck /> : <Eye />}
                      {aviso.revisada ? 'Revisada' : 'Sin revisar'}
                    </Badge>
                  </div>
                  {aviso.motivoSinAcceso && (
                    <p className="mt-3 text-muted-foreground">{aviso.motivoSinAcceso}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={ocupada !== null}
                      onClick={() => void actuar(aviso, 'leer')}
                      aria-label={`${aviso.leida ? 'Marcar sin leer' : 'Marcar leída'}: siniestro ${aviso.siniestro.numeroSiniestro}`}
                    >
                      {aviso.leida ? <Mail aria-hidden="true" /> : <MailOpen aria-hidden="true" />}
                      {aviso.leida ? 'Marcar sin leer' : 'Marcar leída'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={ocupada !== null}
                      onClick={() => void actuar(aviso, 'revisar')}
                      aria-label={`${aviso.revisada ? 'Marcar sin revisar' : 'Marcar revisada'}: siniestro ${aviso.siniestro.numeroSiniestro}`}
                    >
                      {aviso.revisada ? (
                        <RotateCcw aria-hidden="true" />
                      ) : (
                        <Check aria-hidden="true" />
                      )}
                      {aviso.revisada ? 'Sin revisar' : 'Marcar revisada'}
                    </Button>
                  </div>
                  {ocupada === aviso.id && (
                    <p role="status" className="mt-2 font-semibold text-primary">
                      Guardando…
                    </p>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
