import { Link, useRevalidator } from 'react-router'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ClipboardList,
  FolderOpen,
  RefreshCw,
} from 'lucide-react'
import type { DashboardGestor } from '@cova/shared/schemas/dashboard'
import { DIAS_DEMORADO } from '@cova/shared/schemas/siniestros'
import { usePanel } from '@/components/layout/panel-context'
import { SectionHeading } from '@/components/layout/section-heading'
import { Paginacion } from '@/components/paginacion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const fecha = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
const tipoPericia = { CESVI: 'CESVI', MEDICO: 'Médica' }

export function DashboardGestorPage({ dashboard }: { dashboard: DashboardGestor }) {
  const { basePath } = usePanel()
  const revalidator = useRevalidator()
  const actualizando = revalidator.state === 'loading'
  const { casos, periciasPendientes: pendientes } = dashboard
  const indicadores = [
    {
      titulo: 'Casos activos',
      cantidad: casos.activos,
      detalle: 'Asignados a vos y sin cierre.',
      Icon: FolderOpen,
      color: 'bg-info-bg text-info-ink',
    },
    {
      titulo: 'Al día',
      cantidad: casos.alDia,
      detalle: 'Con movimientos recientes.',
      Icon: CheckCircle2,
      color: 'bg-ok-bg text-ok-ink',
    },
    {
      titulo: 'Demorados',
      cantidad: casos.demorados,
      detalle: `${DIAS_DEMORADO * 24} horas o más sin movimientos.`,
      Icon: Clock3,
      color: 'bg-warning-bg text-warning-ink',
    },
  ]

  return (
    <div className="space-y-6">
      <SectionHeading
        section="dashboard"
        titulo="Mi dashboard"
        descripcion="Tu trabajo de hoy, en un solo lugar. Solo se muestran tus casos asignados."
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted-foreground" role="status">
          {actualizando
            ? 'Actualizando información…'
            : `Actualizado el ${fecha(dashboard.actualizadoEn)} a las ${new Intl.DateTimeFormat(
                'es-AR',
                { hour: '2-digit', hourCycle: 'h23', minute: '2-digit' },
              ).format(new Date(dashboard.actualizadoEn))}.`}
        </p>
        <div className="flex w-full flex-wrap gap-3 sm:w-auto">
          <Button
            variant="outline"
            onClick={() => {
              void revalidator.revalidate()
            }}
            disabled={actualizando}
          >
            <RefreshCw aria-hidden="true" className={actualizando ? 'animate-spin' : undefined} />
            Actualizar
          </Button>
          <Button asChild>
            <Link to={`${basePath}/siniestros?activos=true`}>
              Ver mis siniestros
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>

      <section aria-label="Resumen de mis casos" className="grid gap-4 md:grid-cols-3">
        {indicadores.map(({ titulo, cantidad, detalle, Icon, color }) => (
          <article key={titulo} className="rounded-xl border bg-card p-6 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold text-primary">{titulo}</h2>
              <span className={`grid size-12 shrink-0 place-items-center rounded-lg ${color}`}>
                <Icon className="size-6" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-3 dato text-5xl leading-tight font-semibold text-primary">
              {cantidad}
            </p>
            <p className="mt-3 text-muted-foreground">{detalle}</p>
          </article>
        ))}
      </section>

      {casos.activos === 0 && (
        <p className="rounded-lg border bg-surface-subtle p-5 text-muted-foreground">
          Todavía no tenés casos activos asignados. Cuando te asignen uno, aparecerá en este
          resumen.
        </p>
      )}

      <section
        aria-labelledby="pericias-title"
        className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-card"
      >
        <div className="flex flex-wrap items-center gap-3 border-b p-5 sm:p-6">
          <ClipboardList className="size-6 text-primary" aria-hidden="true" />
          <h2 id="pericias-title" className="text-xl font-semibold text-primary">
            Pericias pendientes
          </h2>
          <Badge variant="info" aria-label={`${pendientes.total} pericias pendientes`}>
            {pendientes.total}
          </Badge>
          <p className="w-full text-muted-foreground">
            Solicitudes abiertas de tus casos activos, de la más antigua a la más reciente.
          </p>
        </div>
        {pendientes.items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <CheckCircle2 className="size-10 text-ok-ink" aria-hidden="true" />
            <h3 className="text-xl font-semibold text-primary">No tenés pericias pendientes</h3>
            <p className="max-w-lg text-muted-foreground">
              Las pericias abiertas de tus casos activos aparecerán acá para que puedas hacerles
              seguimiento.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <Table containerLabel="Mis pericias pendientes">
                <TableHeader>
                  <TableRow>
                    <TableHead>Siniestro</TableHead>
                    <TableHead>Pericia</TableHead>
                    <TableHead>Solicitada</TableHead>
                    <TableHead>
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendientes.items.map((pericia) => (
                    <TableRow key={pericia.id}>
                      <TableCell>
                        <p className="dato font-semibold text-primary">
                          {pericia.siniestro.numeroSiniestro}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {pericia.siniestro.aseguradora}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral">{tipoPericia[pericia.tipoPerito]}</Badge>
                        <p className="mt-2 break-words">{pericia.nombre}</p>
                      </TableCell>
                      <TableCell>
                        <time dateTime={pericia.fechaSolicitud}>
                          {fecha(pericia.fechaSolicitud)}
                        </time>
                        <p className="mt-1 text-muted-foreground">
                          Hace {pericia.diasEspera} {pericia.diasEspera === 1 ? 'día' : 'días'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" asChild>
                          <Link
                            to={`${basePath}/siniestros/${pericia.siniestro.id}`}
                            aria-label={`Ver siniestro ${pericia.siniestro.numeroSiniestro}`}
                          >
                            Ver siniestro
                            <ArrowRight aria-hidden="true" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y lg:hidden">
              {pendientes.items.map((pericia) => (
                <li key={pericia.id} className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="dato font-semibold break-all text-primary">
                        {pericia.siniestro.numeroSiniestro}
                      </p>
                      <p className="mt-1 break-words text-muted-foreground">
                        {pericia.siniestro.aseguradora}
                      </p>
                    </div>
                    <Badge variant="neutral">{tipoPericia[pericia.tipoPerito]}</Badge>
                  </div>
                  <p className="break-words">{pericia.nombre}</p>
                  <p className="text-muted-foreground">
                    Solicitada el{' '}
                    <time dateTime={pericia.fechaSolicitud}>{fecha(pericia.fechaSolicitud)}</time> ·
                    Hace {pericia.diasEspera} {pericia.diasEspera === 1 ? 'día' : 'días'}
                  </p>
                  <Button variant="outline" asChild className="w-full">
                    <Link
                      to={`${basePath}/siniestros/${pericia.siniestro.id}`}
                      aria-label={`Ver siniestro ${pericia.siniestro.numeroSiniestro}`}
                    >
                      Ver siniestro
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
            <Paginacion
              pagina={pendientes.pagina}
              porPagina={pendientes.porPagina}
              total={pendientes.total}
              nombre="pericias"
              hrefPagina={(pagina) => `${basePath}/dashboard?paginaPericias=${pagina}`}
            />
          </>
        )}
      </section>
    </div>
  )
}
