import { useLayoutEffect, useRef, useState } from 'react'
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
import { destinoNotificacion, tiposNotificacion } from './tipos'

export function ListaNotificaciones({
  items,
  basePath,
  compacta = false,
  actualizando = false,
  onListaVacia,
  onCambio,
  onAbrir,
}: {
  items: NotificacionBandeja[]
  basePath: string
  compacta?: boolean
  actualizando?: boolean
  onListaVacia?: () => void
  onCambio: (id: number, cambios: { leida?: boolean; revisada?: boolean }) => void
  onAbrir?: () => void
}) {
  const navigate = useNavigate()
  const [ocupada, setOcupada] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [anuncio, setAnuncio] = useState('')
  const botonesAbrir = useRef(new Map<number, HTMLButtonElement>())
  const botonesLeer = useRef(new Map<number, HTMLButtonElement>())
  const foco = useRef<{ id: number; indice: number; boton: HTMLButtonElement } | null>(null)
  useLayoutEffect(() => {
    const pendiente = foco.current
    if (!pendiente || actualizando || ocupada !== null) return
    foco.current = null
    // Respetar a quien ya se movió a otro control mientras se guardaba.
    const activo = document.activeElement
    if (activo && activo !== document.body && activo !== pendiente.boton) return
    if (items.some((a) => a.id === pendiente.id) && pendiente.boton.isConnected) {
      pendiente.boton.focus({ preventScroll: true })
      return
    }
    const siguiente = items[pendiente.indice]
    const abrir = siguiente && botonesAbrir.current.get(siguiente.id)
    const boton =
      abrir && !abrir.disabled ? abrir : siguiente && botonesLeer.current.get(siguiente.id)
    if (boton) boton.focus({ preventScroll: true })
    else onListaVacia?.()
  }, [items, actualizando, ocupada, onListaVacia])
  async function actuar(
    aviso: NotificacionBandeja,
    accion: 'abrir' | 'leer' | 'revisar',
    boton: HTMLButtonElement,
  ) {
    if (ocupada !== null) return
    setOcupada(aviso.id)
    setError('')
    setAnuncio('')
    try {
      if (accion === 'abrir') {
        if (!aviso.puedeAbrirSiniestro) return
        // Esperar la revisión antes de navegar: un error queda visible, sin abrir otro destino.
        await marcarRevision(aviso.id, true)
        onCambio(aviso.id, { leida: true, revisada: true })
        actualizarNotificaciones()
        onAbrir?.()
        await navigate(destinoNotificacion(basePath, aviso.tipo, aviso.siniestro.id))
      } else if (accion === 'leer') {
        await marcarLectura(aviso.id, !aviso.leida)
        foco.current = { id: aviso.id, indice: items.findIndex((a) => a.id === aviso.id), boton }
        setAnuncio(
          aviso.leida ? 'Notificación marcada sin leer.' : 'Notificación marcada como leída.',
        )
        onCambio(aviso.id, { leida: !aviso.leida })
        actualizarNotificaciones()
      } else {
        await marcarRevision(aviso.id, !aviso.revisada)
        foco.current = { id: aviso.id, indice: items.findIndex((a) => a.id === aviso.id), boton }
        setAnuncio(
          aviso.revisada
            ? 'Notificación marcada sin revisar.'
            : 'Notificación marcada como revisada.',
        )
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
      <p className="sr-only" role="status">
        {anuncio}
      </p>
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
                    ref={(boton) => {
                      if (boton) botonesAbrir.current.set(aviso.id, boton)
                      else botonesAbrir.current.delete(aviso.id)
                    }}
                    onClick={(e) => void actuar(aviso, 'abrir', e.currentTarget)}
                    disabled={ocupada !== null || !aviso.puedeAbrirSiniestro}
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
                  {!compacta && (
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
                  )}
                  {aviso.motivoSinAcceso && (
                    <p className="mt-3 text-muted-foreground">{aviso.motivoSinAcceso}</p>
                  )}
                  {!compacta && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={ocupada !== null}
                        ref={(boton) => {
                          if (boton) botonesLeer.current.set(aviso.id, boton)
                          else botonesLeer.current.delete(aviso.id)
                        }}
                        onClick={(e) => void actuar(aviso, 'leer', e.currentTarget)}
                        aria-label={`${aviso.leida ? 'Marcar sin leer' : 'Marcar leída'}: siniestro ${aviso.siniestro.numeroSiniestro}`}
                      >
                        {aviso.leida ? (
                          <Mail aria-hidden="true" />
                        ) : (
                          <MailOpen aria-hidden="true" />
                        )}
                        {aviso.leida ? 'Marcar sin leer' : 'Marcar leída'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={ocupada !== null}
                        onClick={(e) => void actuar(aviso, 'revisar', e.currentTarget)}
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
                  )}
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
