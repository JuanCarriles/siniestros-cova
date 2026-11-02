import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Bell, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import {
  bandejaNotificacionesSchema,
  type BandejaNotificaciones,
} from '@cova/shared/schemas/bandeja-notificaciones'
import { Aviso } from '@/components/aviso'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { api, ApiError } from '@/lib/api'
import { fechaHoraDe } from '@/features/siniestros/ficha/formato'

// Los avisos son privados. Sin sondeo de fondo que renueve la sesión durante la inactividad.
export function NotificacionesPanel({ basePath }: { basePath: string }) {
  const { pathname } = useLocation()
  const [abierto, setAbierto] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [revision, setRevision] = useState(0)
  const [datos, setDatos] = useState<BandejaNotificaciones | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pendiente = useRef<AbortController | null>(null)
  useEffect(() => {
    async function consultar() {
      if (document.hidden) return
      pendiente.current?.abort()
      const controlador = new AbortController()
      pendiente.current = controlador
      try {
        const respuesta = await api(`/notificaciones?pagina=${pagina}`, {
          signal: controlador.signal,
        })
        if (!controlador.signal.aborted) {
          const recibidos = bandejaNotificacionesSchema.parse(respuesta)
          setDatos(recibidos)
          if (recibidos.pagina !== pagina) setPagina(recibidos.pagina)
          setError(null)
        }
      } catch (err) {
        if (!controlador.signal.aborted)
          setError(
            err instanceof ApiError ? err.message : 'No se pudieron consultar las notificaciones.',
          )
      }
    }
    void consultar()
    const actualizar = () => {
      void consultar()
    }
    window.addEventListener('focus', actualizar)
    document.addEventListener('visibilitychange', actualizar)
    return () => {
      pendiente.current?.abort()
      window.removeEventListener('focus', actualizar)
      document.removeEventListener('visibilitychange', actualizar)
    }
  }, [pagina, revision, abierto, pathname])
  const vigente = datos?.pagina === pagina ? datos : null
  async function abrirNotificacion(id: number) {
    try {
      await api(`/notificaciones/${id}/lectura`, { method: 'PATCH' })
      setAbierto(false)
      setRevision((r) => r + 1)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo marcar como leída.')
    }
  }
  return (
    <Dialog
      open={abierto}
      onOpenChange={(valor) => {
        setAbierto(valor)
        if (valor) setPagina(1)
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="shrink-0"
          aria-label={`Notificaciones${datos ? `: ${datos.sinLeer} sin leer` : ''}`}
        >
          <Bell aria-hidden="true" />
          <span className="hidden sm:inline">Notificaciones</span>
          {datos && datos.sinLeer > 0 && (
            <span
              aria-hidden="true"
              className="rounded-full bg-primary px-2 text-sm text-primary-foreground"
            >
              {datos.sinLeer}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent size="wide">
        <DialogHeader>
          <DialogTitle>Notificaciones</DialogTitle>
          <DialogDescription>
            Avisos de tus siniestros. Abrí uno para consultar su ficha.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status">{datos ? `${datos.sinLeer} sin leer` : 'Consultando avisos…'}</p>
          <Button variant="outline" onClick={() => setRevision((r) => r + 1)}>
            <RefreshCw aria-hidden="true" />
            Actualizar
          </Button>
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {vigente?.total === 0 && <Aviso tipo="info">Todavía no tenés notificaciones.</Aviso>}
        {!vigente && !error && <p role="status">Cargando notificaciones…</p>}
        {vigente && (
          <ul className="divide-y rounded-lg border">
            {vigente.items.map((aviso) => (
              <li key={aviso.id} className="p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span className={aviso.leida ? '' : 'font-bold text-primary'}>
                    {aviso.leida ? 'Leída' : 'Sin leer'}
                  </span>
                  <time dateTime={aviso.fecha}>{fechaHoraDe(aviso.fecha)}</time>
                </div>
                <p className="mb-2 break-words">{aviso.mensaje}</p>
                <Link
                  to={`${basePath}/siniestros/${aviso.siniestro.id}`}
                  className="inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4"
                  onClick={() => void abrirNotificacion(aviso.id)}
                >
                  Ver siniestro {aviso.siniestro.numeroSiniestro}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {datos && datos.total > datos.porPagina && (
          <nav
            aria-label="Páginas de notificaciones"
            className="flex items-center justify-between gap-2"
          >
            <Button
              variant="outline"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              <ChevronLeft aria-hidden="true" />
              Anterior
            </Button>
            <span>
              {datos.pagina} de {Math.ceil(datos.total / datos.porPagina)}
            </span>
            <Button
              variant="outline"
              disabled={pagina * datos.porPagina >= datos.total}
              onClick={() => setPagina((p) => p + 1)}
            >
              Siguiente
              <ChevronRight aria-hidden="true" />
            </Button>
          </nav>
        )}
      </DialogContent>
    </Dialog>
  )
}
