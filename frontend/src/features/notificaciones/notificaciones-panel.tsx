import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Bell, BellRing, RefreshCw } from 'lucide-react'
import { consultaNotificacionesSchema } from '@cova/shared/schemas/bandeja-notificaciones'
import { Aviso } from '@/components/aviso'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { suscribirActualizacionNotificaciones } from './actualizar-notificaciones'
import { ListaNotificaciones } from './lista-notificaciones'
import { useNotificaciones } from './use-notificaciones'

export function NotificacionesPanel({ basePath }: { basePath: string }) {
  const [abierto, setAbierto] = useState(false)
  const resumen = useNotificaciones(consultaNotificacionesSchema.parse({}))
  const panel = useNotificaciones(
    consultaNotificacionesSchema.parse({ lectura: 'sin-leer' }),
    'visibles',
    abierto,
  )
  const actualizarResumen = resumen.actualizar
  useEffect(() => {
    const actualizar = () => {
      if (!document.hidden) actualizarResumen()
    }
    const intervalo = window.setInterval(actualizar, 60000)
    const desuscribir = suscribirActualizacionNotificaciones(actualizar)
    window.addEventListener('focus', actualizar)
    document.addEventListener('visibilitychange', actualizar)
    return () => {
      clearInterval(intervalo)
      desuscribir()
      window.removeEventListener('focus', actualizar)
      document.removeEventListener('visibilitychange', actualizar)
    }
  }, [actualizarResumen])
  // Mantener el último contador durante un refresco para que no parpadee ni se anuncie repetidamente.
  const sinLeer = resumen.ultimo?.sinLeer
  return (
    <Popover
      open={abierto}
      onOpenChange={(valor) => {
        if (valor) panel.actualizar()
        setAbierto(valor)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="shrink-0 gap-2 border-primary/40 bg-surface font-semibold text-primary"
          aria-label={`Notificaciones${sinLeer !== undefined ? `: ${sinLeer} sin leer` : ''}`}
        >
          <Bell aria-hidden="true" />
          <span className="hidden sm:inline">Notificaciones</span>
          {sinLeer !== undefined && sinLeer > 0 && (
            <span
              aria-hidden="true"
              className="grid min-w-7 place-items-center rounded-full bg-primary px-2 py-0.5 dato text-sm text-primary-foreground"
            >
              {sinLeer > 99 ? '99+' : sinLeer}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Notificaciones nuevas" className="sm:w-[32rem]">
        <header className="border-b-2 border-line bg-surface-subtle p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-bold text-primary">
              <BellRing className="size-6" aria-hidden="true" />
              Notificaciones nuevas
            </h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar notificaciones nuevas"
              onClick={panel.actualizar}
            >
              <RefreshCw aria-hidden="true" />
            </Button>
          </div>
          <p className="mt-2 text-muted-foreground">
            Avisos sin leer al abrir este panel. Se marcan leídos al mostrarse.
          </p>
        </header>
        <div className="max-h-[min(27rem,55dvh)] overflow-y-auto overscroll-contain">
          {panel.error && (
            <Aviso tipo="error" className="m-4">
              {panel.error}
            </Aviso>
          )}
          {!panel.datos && !panel.error && (
            <p role="status" className="p-5">
              Consultando avisos…
            </p>
          )}
          {panel.datos?.items.length === 0 && (
            <div className="grid justify-items-center gap-3 px-6 py-9 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-ok-bg text-ok-ink">
                <Bell aria-hidden="true" className="size-7" />
              </span>
              <p className="text-lg font-bold text-primary">Estás al día</p>
              <p className="text-muted-foreground">
                No tenés notificaciones sin leer. Podés consultar las anteriores en la bandeja
                completa.
              </p>
            </div>
          )}
          {panel.datos && (
            <ListaNotificaciones
              items={panel.datos.items}
              basePath={basePath}
              compacta
              onCambio={panel.aplicar}
              onAbrir={() => setAbierto(false)}
            />
          )}
        </div>
        <footer className="border-t-2 border-line p-4">
          <Button asChild className="w-full">
            <Link to={`${basePath}/notificaciones`} onClick={() => setAbierto(false)}>
              Ver todas las notificaciones
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </footer>
      </PopoverContent>
    </Popover>
  )
}
