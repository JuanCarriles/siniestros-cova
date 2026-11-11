import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Bell, CheckCheck, ListFilter, RefreshCw } from 'lucide-react'
import { parametrosNotificaciones } from '@cova/shared/schemas/bandeja-notificaciones'
import { SectionHeading } from '@/components/layout/section-heading'
import { usePanel } from '@/components/layout/panel-context'
import { Button } from '@/components/ui/button'
import { FiltroAbm } from '@/components/abm/filtro-abm'
import { Paginacion } from '@/components/paginacion'
import { Aviso } from '@/components/aviso'
import { ApiError } from '@/lib/api'
import { ListaNotificaciones } from './lista-notificaciones'
import { useNotificaciones } from './use-notificaciones'
import { leerNotificaciones } from './api'
import {
  actualizarNotificaciones,
  suscribirActualizacionNotificaciones,
} from './actualizar-notificaciones'
import { tiposNotificacion } from './tipos'

export function NotificacionesPage() {
  const { basePath } = usePanel()
  const [params, setParams] = useSearchParams()
  const consulta = parametrosNotificaciones(params)
  const lista = useNotificaciones(consulta, 'todas')
  const resumen = useRef<HTMLDivElement>(null)
  const enfocarResumen = useRef(false)
  const actualizarLista = lista.actualizar
  useEffect(() => suscribirActualizacionNotificaciones(actualizarLista), [actualizarLista])
  useEffect(() => {
    if (lista.datos && enfocarResumen.current) {
      enfocarResumen.current = false
      resumen.current?.focus()
    }
  }, [lista.datos])
  const [marcando, setMarcando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  function cambiar(clave: string, valor: string | null) {
    setParams(
      (actual) => {
        const siguiente = new URLSearchParams(actual)
        siguiente.delete('pagina')
        if (!valor || valor === 'todas') siguiente.delete(clave)
        else siguiente.set(clave, valor)
        return siguiente
      },
      { preventScrollReset: true },
    )
  }
  async function leerTodas() {
    if (marcando) return
    setMarcando(true)
    setError('')
    setMensaje('')
    try {
      await leerNotificaciones({ todas: true })
      lista.actualizar()
      actualizarNotificaciones()
      setMensaje(
        'Todas tus notificaciones quedaron marcadas como leídas. La revisión se conserva por separado.',
      )
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudieron marcar las notificaciones. Probá de nuevo.',
      )
    } finally {
      setMarcando(false)
    }
  }
  const filtroActivo = Boolean(
    consulta.tipo || consulta.revision !== 'todas' || consulta.lectura !== 'todas',
  )
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading section="notificaciones" />
        <div className="mb-5 flex flex-wrap gap-2">
          <Button variant="outline" onClick={lista.actualizar}>
            <RefreshCw aria-hidden="true" />
            Actualizar
          </Button>
          <Button variant="outline" loading={marcando} onClick={() => void leerTodas()}>
            <CheckCheck aria-hidden="true" />
            Marcar todas leídas
          </Button>
        </div>
      </div>
      {mensaje && (
        <Aviso tipo="exito" className="mb-4">
          {mensaje}
        </Aviso>
      )}
      {(error || lista.error) && (
        <Aviso tipo="error" enfocar className="mb-4">
          {error || lista.error}
        </Aviso>
      )}
      <section
        aria-label="Bandeja de notificaciones"
        className="overflow-hidden rounded-2xl border-2 border-line-strong bg-surface shadow-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-line bg-surface-subtle p-4 sm:p-5">
          <div
            className="flex flex-wrap gap-1 rounded-lg border border-input bg-surface p-1"
            role="group"
            aria-label="Filtrar por revisión"
          >
            {(
              [
                ['todas', 'Todas'],
                ['pendientes', 'Sin revisar'],
                ['revisadas', 'Revisadas'],
              ] as const
            ).map(([valor, texto]) => (
              <Button
                key={valor}
                size="sm"
                variant={consulta.revision === valor ? 'default' : 'ghost'}
                aria-pressed={consulta.revision === valor}
                onClick={() => cambiar('revision', valor)}
              >
                {texto}
              </Button>
            ))}
          </div>
          <div className="flex w-full flex-wrap gap-3 sm:w-auto">
            <FiltroAbm
              etiqueta="Filtrar por tipo de notificación"
              textoTodas="Todos los tipos"
              valor={consulta.tipo ?? null}
              onCambio={(valor) => cambiar('tipo', valor)}
              opciones={Object.entries(tiposNotificacion).map(([valor, tipo]) => ({
                valor,
                etiqueta: tipo.etiqueta,
              }))}
            />
            {filtroActivo && (
              <Button variant="ghost" onClick={() => setParams({})}>
                <ListFilter aria-hidden="true" />
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>
        <div
          className="flex flex-wrap justify-between gap-2 border-b border-line px-4 py-3 sm:px-5"
          role="status"
          ref={resumen}
          tabIndex={-1}
        >
          <p className="font-semibold text-primary">
            {lista.datos
              ? `${lista.datos.total} ${lista.datos.total === 1 ? 'notificación' : 'notificaciones'}${filtroActivo ? ' con estos filtros' : ''}`
              : 'Consultando notificaciones…'}
          </p>
          {lista.datos && (
            <p className="text-muted-foreground">
              {lista.datos.sinRevisar} sin revisar · {lista.datos.sinLeer} sin leer
            </p>
          )}
        </div>
        <p className="border-b border-line px-4 py-3 text-muted-foreground sm:px-5">
          Al entrar se marcan como leídas. Abrí un aviso para revisar su siniestro o marcá la
          revisión manualmente.
        </p>
        {!lista.datos && !lista.error && (
          <p role="status" className="p-6">
            Cargando bandeja…
          </p>
        )}
        {lista.datos?.items.length === 0 && (
          <div className="grid justify-items-center gap-3 p-8 text-center sm:p-12">
            <span className="grid size-16 place-items-center rounded-full bg-info-bg text-info-ink">
              <Bell aria-hidden="true" className="size-8" />
            </span>
            <h2 className="text-xl font-bold text-primary">
              {filtroActivo
                ? 'No hay notificaciones con estos filtros'
                : 'Todavía no tenés notificaciones'}
            </h2>
            <p className="max-w-xl text-muted-foreground">
              {filtroActivo
                ? 'Probá otro tipo o mostrálas todas para encontrar lo que buscás.'
                : 'Cuando haya novedades en tus casos, vas a encontrarlas acá.'}
            </p>
            {filtroActivo && (
              <Button variant="outline" onClick={() => setParams({})}>
                Mostrar todas
              </Button>
            )}
          </div>
        )}
        {lista.datos && (
          <ListaNotificaciones
            items={lista.datos.items}
            basePath={basePath}
            onCambio={() => {
              enfocarResumen.current = true
              setMensaje('')
              lista.actualizar()
            }}
          />
        )}
        {lista.datos && (
          <Paginacion
            pagina={lista.datos.pagina}
            porPagina={lista.datos.porPagina}
            total={lista.datos.total}
            nombre="notificaciones"
            hrefPagina={(pagina) => {
              const siguientes = new URLSearchParams(params)
              siguientes.set('pagina', String(pagina))
              return `?${siguientes}`
            }}
          />
        )}
      </section>
    </>
  )
}
