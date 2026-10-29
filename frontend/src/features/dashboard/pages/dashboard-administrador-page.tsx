import type { ReactNode } from 'react'
import { Link, useRevalidator } from 'react-router'
import { ArrowLeft, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react'
import type { BloqueDashboard, DashboardAdministrador } from '@cova/shared/schemas/dashboard'
import { DIAS_ALERTA, DIAS_DEMORADO } from '@cova/shared/schemas/siniestros'
import { Aviso } from '@/components/aviso'
import { usePanel } from '@/components/layout/panel-context'
import { Paginacion } from '@/components/paginacion'
import { Button } from '@/components/ui/button'
import { tonoDeEstado } from '@/lib/estados-visuales'
import { cn } from '@/lib/utils'
import { DiasSinMovimiento } from '@/features/siniestros/components/celdas-siniestro'
import { SectionHeading } from '@/components/layout/section-heading'
import { fechaHoraDe } from '@/features/siniestros/ficha/formato'

const titulos = {
  demorados: 'Casos demorados',
  actividad: 'Actividad reciente',
}
const coloresEstado = {
  info: 'bg-info-ink',
  success: 'bg-ok-ink',
  warning: 'bg-warning-ink',
  neutral: 'bg-neutral-ink',
}
const relativo = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' })

function tiempoDesde(iso: string, ahora: string) {
  const minutos = Math.max(0, Math.floor((Date.parse(ahora) - Date.parse(iso)) / 60_000))
  if (minutos < 1) return 'Hace instantes'
  if (minutos < 60) return relativo.format(-minutos, 'minute')
  if (minutos < 1440) return relativo.format(-Math.floor(minutos / 60), 'hour')
  const dias = Math.floor(minutos / 1440)
  return relativo.format(-dias, 'day')
}
function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/)
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : ''}`.toLocaleUpperCase(
    'es-AR',
  )
}
function Bloque({
  bloque,
  datos,
  ver,
  children,
  vacio,
  descripcion,
}: {
  bloque: BloqueDashboard
  datos: { total: number; pagina: number; porPagina: number }
  ver?: BloqueDashboard
  children: ReactNode
  vacio: string
  descripcion: string
}) {
  const { basePath } = usePanel()
  return (
    <section
      aria-labelledby={`titulo-${bloque}`}
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id={`titulo-${bloque}`} className="font-bold text-foreground">
            {titulos[bloque]}
          </h2>
          <p className="text-sm text-muted-foreground">{descripcion}</p>
        </div>
        {!ver && datos.total > 0 && (
          <Link
            to={`${basePath}/dashboard?ver=${bloque}`}
            className="inline-flex min-h-12 items-center font-semibold text-primary underline-offset-4 hover:underline"
            aria-label={`Ver todos: ${titulos[bloque].toLowerCase()}`}
          >
            {bloque === 'actividad'
              ? 'Ver historial completo'
              : bloque === 'demorados'
                ? `Ver los ${datos.total}`
                : 'Ver todos'}
          </Link>
        )}
      </header>
      {datos.total === 0 ? (
        <div className="flex items-start gap-3 px-4 py-6 text-muted-foreground">
          <CheckCircle2 className="mt-1 size-5 shrink-0 text-ok-ink" aria-hidden="true" />
          <p>{vacio}</p>
        </div>
      ) : (
        children
      )}
      {ver === bloque && (
        <Paginacion
          pagina={datos.pagina}
          porPagina={datos.porPagina}
          total={datos.total}
          nombre={bloque === 'actividad' ? 'movimientos' : 'siniestros'}
          hrefPagina={(pagina) => `${basePath}/dashboard?ver=${bloque}&pagina=${pagina}`}
        />
      )}
      {bloque === 'demorados' && datos.total > 0 && (
        <p className="mt-auto border-t bg-surface-subtle px-4 py-2 text-sm text-muted-foreground">
          Amarillo: {DIAS_DEMORADO}–{DIAS_ALERTA - 1} días · Rojo: desde {DIAS_ALERTA} días.
        </p>
      )}
    </section>
  )
}

export function DashboardAdministradorPage({
  dashboard,
  ver,
}: {
  dashboard: DashboardAdministrador
  ver?: BloqueDashboard
}) {
  const { basePath } = usePanel()
  const revalidator = useRevalidator()
  const actualizando = revalidator.state === 'loading'
  const ficha = (id: number) => `${basePath}/siniestros/${id}`
  return (
    <div className="space-y-4">
      {ver && (
        <Button variant="link" asChild className="px-0">
          <Link to={`${basePath}/dashboard`}>
            <ArrowLeft aria-hidden="true" />
            Volver al dashboard
          </Link>
        </Button>
      )}
      <SectionHeading
        section="dashboard"
        titulo={ver ? titulos[ver] : 'Dashboard del estudio'}
        descripcion="Totales por estado, casos que necesitan atención y actividad reciente del estudio."
      />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-muted-foreground">
          Resumen del estudio <span aria-hidden="true">·</span>{' '}
          <strong className="dato text-foreground">{dashboard.totalSiniestros}</strong> siniestros
          sin baja
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p role="status" className="text-sm text-muted-foreground">
            {actualizando ? 'Actualizando…' : `Actualizado ${fechaHoraDe(dashboard.actualizadoEn)}`}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="text-sm text-primary"
            disabled={actualizando}
            onClick={() => {
              void revalidator.revalidate()
            }}
          >
            <RefreshCw
              className={cn('size-4', actualizando && 'animate-spin')}
              aria-hidden="true"
            />
            Actualizar
          </Button>
        </div>
      </div>
      {!ver && (
        <section
          aria-label="Totales por estado"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]"
        >
          {dashboard.estados.map((estado) => (
            <Link
              key={estado.id}
              to={`${basePath}/siniestros?estado=${estado.id}`}
              className="flex min-w-0 flex-col rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent"
              aria-label={`${estado.nombre}: ${estado.cantidad} siniestros. Ver listado`}
            >
              <div className="flex items-start gap-2 text-sm font-semibold text-muted-foreground">
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-1.5 size-2.5 shrink-0 rounded-sm',
                    coloresEstado[tonoDeEstado(estado.nombre)],
                  )}
                />
                <span className="break-words">{estado.nombre}</span>
              </div>
              <p className="mt-auto pt-1 dato text-2xl leading-tight font-bold">
                {estado.cantidad}
              </p>
            </Link>
          ))}
          {dashboard.estados.length === 0 && (
            <div className="col-span-full">
              <Aviso tipo="info">
                Todavía no hay estados configurados para mostrar el resumen.
              </Aviso>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-4">
        {(!ver || ver === 'demorados') && (
          <Bloque
            bloque="demorados"
            datos={dashboard.demorados}
            ver={ver}
            descripcion={`${dashboard.demorados.total} en total`}
            vacio="No hay casos demorados. Los casos activos están al día."
          >
            <ul className="divide-y">
              {dashboard.demorados.items.map((caso) => (
                <li key={caso.id}>
                  <Link
                    to={ficha(caso.id)}
                    className="grid min-h-16 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors hover:bg-row-hover xl:grid-cols-[minmax(6.5rem,0.9fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_auto]"
                    aria-label={`Ver siniestro ${caso.numeroSiniestro}. ${caso.asegurado ?? 'Sin asegurado'}. ${caso.diasSinMovimiento} días sin movimiento.`}
                  >
                    <span className="dato font-bold break-all text-primary">
                      {caso.numeroSiniestro}
                    </span>
                    <span className="min-w-0 font-semibold break-words max-xl:col-start-1 max-xl:row-start-2">
                      {caso.asegurado ?? 'Sin asegurado'}
                    </span>
                    <span
                      className={cn(
                        'min-w-0 break-words',
                        'text-muted-foreground',
                        'max-xl:col-start-1 max-xl:row-start-3',
                      )}
                    >
                      {caso.gestor.nombre}
                    </span>
                    <span className="justify-self-end max-xl:col-start-2 max-xl:row-span-3 max-xl:row-start-1">
                      <DiasSinMovimiento dias={caso.diasSinMovimiento} cerrado={false} />{' '}
                      <span aria-hidden="true">días</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Bloque>
        )}
      </div>
      {(!ver || ver === 'actividad') && (
        <Bloque
          bloque="actividad"
          datos={dashboard.actividad}
          ver={ver}
          descripcion={`${dashboard.actividad.total} movimientos`}
          vacio="Todavía no hay actividad registrada en los siniestros disponibles."
        >
          <ol className="divide-y">
            {dashboard.actividad.items.map((evento) => (
              <li key={evento.id}>
                <Link
                  to={ficha(evento.siniestro.id)}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-row-hover"
                  aria-label={`Ver siniestro ${evento.siniestro.numeroSiniestro}. ${evento.descripcion}`}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-info-bg text-sm font-bold text-primary"
                  >
                    {iniciales(evento.autor)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
                    <span className="min-w-0 flex-1 basis-72 break-words">
                      <strong>{evento.autor}</strong>
                      <span className="text-muted-foreground">
                        {' '}
                        ·{' '}
                        {evento.descripcion.startsWith(`${evento.autor} `)
                          ? evento.descripcion.slice(evento.autor.length + 1)
                          : evento.descripcion}{' '}
                      </span>
                      <span className="dato font-bold text-primary">
                        {evento.siniestro.numeroSiniestro}
                      </span>
                    </span>
                    <time
                      dateTime={evento.fecha}
                      title={fechaHoraDe(evento.fecha)}
                      aria-label={fechaHoraDe(evento.fecha)}
                      className="shrink-0 text-muted-foreground"
                    >
                      {tiempoDesde(evento.fecha, dashboard.actualizadoEn)}
                    </time>
                  </span>
                  <ArrowRight
                    className="hidden size-4 shrink-0 text-primary sm:block"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ol>
        </Bloque>
      )}
    </div>
  )
}
