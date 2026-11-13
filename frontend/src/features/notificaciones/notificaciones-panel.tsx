import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Bell, BellRing } from 'lucide-react'
import { consultaNotificacionesSchema } from '@cova/shared/schemas/bandeja-notificaciones'
import { cn } from '@/lib/utils'
import { Aviso } from '@/components/aviso'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useResumenNotificaciones } from './use-resumen-notificaciones'
import { ListaNotificaciones } from './lista-notificaciones'
import { useNotificaciones } from './use-notificaciones'

export function NotificacionesPanel({ basePath }: { basePath: string }) {
  const [abierto, setAbierto] = useState(false)
  const resumen = useResumenNotificaciones()
  const panel = useNotificaciones(
    consultaNotificacionesSchema.parse({ lectura: 'sin-leer' }),
    'visibles',
    abierto,
  )
  const sinLeer = resumen?.sinLeer
  const haySinLeer = (sinLeer ?? 0) > 0
  const datosPanel = panel.error ? null : panel.datos
  return (
    <Popover
      open={abierto}
      onOpenChange={(valor) => {
        if (valor) panel.reiniciarPanel()
        setAbierto(valor)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant={haySinLeer ? 'default' : 'outline'}
          className={cn(
            'shrink-0 gap-2 font-semibold',
            haySinLeer
              ? 'bg-info-ink text-primary-foreground hover:bg-info-ink/90'
              : 'border-primary/40 bg-surface text-primary',
          )}
          aria-label={`Notificaciones${sinLeer !== undefined ? `: ${sinLeer} sin leer` : ''}`}
        >
          {haySinLeer ? <BellRing aria-hidden="true" /> : <Bell aria-hidden="true" />}
          <span className="hidden sm:inline">Notificaciones</span>
          {sinLeer !== undefined && sinLeer > 0 && (
            <span
              aria-hidden="true"
              className="grid min-w-7 place-items-center rounded-full bg-primary-foreground px-2 py-0.5 dato text-sm text-info-ink"
            >
              {sinLeer > 99 ? '99+' : sinLeer}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {sinLeer !== undefined &&
          (sinLeer === 0
            ? 'No tenés notificaciones sin leer.'
            : `Tenés ${sinLeer} ${sinLeer === 1 ? 'notificación sin leer' : 'notificaciones sin leer'}.`)}
      </span>
      <PopoverContent aria-label="Notificaciones nuevas" className="sm:w-[32rem]">
        <header className="border-b-2 border-line bg-surface-subtle p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-bold text-primary">
              <BellRing className="size-6" aria-hidden="true" />
              Notificaciones nuevas
            </h2>
          </div>
          <p className="mt-2 text-muted-foreground">
            Avisos sin leer al abrir este panel. Se marcan leídos al mostrarse.
          </p>
        </header>
        <div className="max-h-[min(27rem,55dvh)] overflow-y-auto overscroll-contain">
          {panel.avisoLectura && (
            <Aviso tipo="info" className="m-4">
              {panel.avisoLectura}
            </Aviso>
          )}
          {panel.error && (
            <Aviso tipo="error" className="m-4">
              {panel.error}
            </Aviso>
          )}
          {!datosPanel && !panel.error && (
            <p role="status" className="p-5">
              Consultando avisos…
            </p>
          )}
          {datosPanel?.items.length === 0 && (
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
          {datosPanel && (
            <ListaNotificaciones
              items={datosPanel.items}
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
