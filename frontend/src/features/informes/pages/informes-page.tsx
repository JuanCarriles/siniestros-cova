import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { generarInformeSchema } from '@cova/shared/schemas/informes'
import { Paginacion } from '@/components/paginacion'
import { Checkbox } from '@/components/ui/checkbox'
import { useEffect, useState } from 'react'
import { useLoaderData, useRevalidator, useSearchParams } from 'react-router'
import { Download, FileChartColumn, FlaskConical, Mail, RefreshCw } from 'lucide-react'
import type { InformeListado } from '@cova/shared/schemas/informes'
import { SectionHeading } from '@/components/layout/section-heading'
import { usePanel } from '@/components/layout/panel-context'
import { TablaAbm, type ColumnaAbm } from '@/components/abm/tabla-abm'
import { Aviso } from '@/components/aviso'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TextField } from '@/components/text-field'
import { api, ApiError } from '@/lib/api'
import type { cargarInformes } from '../loader'

export function InformesPage() {
  const datos = useLoaderData<typeof cargarInformes>(),
    { usuario, basePath } = usePanel(),
    revalidator = useRevalidator(),
    [params] = useSearchParams()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof generarInformeSchema>, unknown, z.output<typeof generarInformeSchema>>(
    {
      resolver: zodResolver(generarInformeSchema),
      defaultValues: {
        periodo: new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Argentina/Buenos_Aires',
          year: 'numeric',
          month: '2-digit',
        })
          .format(new Date())
          .slice(0, 7),
        enviarCorreo: false,
      },
    },
  )
  const [ocupado, setOcupado] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [mensaje, setMensaje] = useState<string | null>(null)
  const esSuper = usuario.tipo === 'SUPER_ADMINISTRADOR'
  const generando = datos.informes.some((i) => i.estado === 'GENERANDO')
  useEffect(() => {
    if (!generando) return
    const t = setInterval(() => void revalidator.revalidate(), 10000)
    return () => clearInterval(t)
  }, [generando, revalidator])
  async function accion(clave: string, trabajo: () => Promise<void>) {
    setOcupado(clave)
    setError(null)
    setMensaje(null)
    try {
      await trabajo()
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : 'No se pudo completar la operación. Volvé a intentarlo.',
      )
    } finally {
      setOcupado(null)
      void revalidator.revalidate()
    }
  }
  async function descargar(i: InformeListado) {
    await accion(i.id, async () => {
      const firma = await api<{ url: string }>(`/informes/${i.id}/descarga`)
      window.location.assign(firma.url)
    })
  }
  const columnas: ColumnaAbm<InformeListado>[] = [
    {
      id: 'periodo',
      encabezado: 'Período',
      principal: true,
      celda: (i) => (
        <span className="grid gap-2">
          <span className="flex items-center gap-2">
            <FileChartColumn className="size-6 text-primary" aria-hidden="true" />
            {i.periodo}
          </span>
          <Badge variant={i.prueba ? 'outline' : 'default'}>
            {i.prueba ? 'Prueba' : 'Oficial'}
          </Badge>
        </span>
      ),
    },
    {
      id: 'fecha',
      encabezado: 'Generado',
      celda: (i) => (
        <time dateTime={i.fechaCreacion}>
          {new Date(i.fechaCreacion).toLocaleString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
      ),
    },
    {
      id: 'estado',
      encabezado: 'Estado',
      celda: (i) => (
        <div className="grid max-w-sm gap-2">
          <span>
            {(
              {
                LISTO: 'PDF disponible',
                GENERANDO: 'Generando PDF…',
                ERROR: 'No se pudo generar',
                PENDIENTE: 'Pendiente',
              } as Record<string, string>
            )[i.estado] ?? i.estado}
          </span>
          {i.error && <p className="text-base text-danger-ink">{i.error}</p>}
          {i.proximoIntento && (
            <p className="text-muted-foreground">
              Próximo reintento automático:{' '}
              {new Date(i.proximoIntento).toLocaleString('es-AR', {
                timeZone: 'America/Argentina/Buenos_Aires',
              })}
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'correo',
      encabezado: 'Correo',
      celda: (i) => (
        <div className="grid gap-2">
          <span>
            {i.correoEnviado
              ? 'Envío confirmado'
              : i.destinatarios.length
                ? 'Envío parcial'
                : i.prueba
                  ? 'Sin envío confirmado'
                  : 'Pendiente de envío'}
          </span>
          {i.destinatarios.length > 0 && (
            <ul
              aria-label="Destinatarios con envío confirmado"
              className="grid gap-1 text-muted-foreground"
            >
              {i.destinatarios.map((d) => (
                <li key={d.email} className="break-all">
                  {d.email}
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    },
    {
      id: 'acciones',
      encabezado: 'Acciones',
      celda: (i) => (
        <div className="flex flex-wrap gap-2">
          {i.disponible && (
            <Button variant="outline" disabled={ocupado !== null} onClick={() => void descargar(i)}>
              <Download aria-hidden="true" />
              Descargar PDF
            </Button>
          )}
          {esSuper && i.disponible && !i.correoEnviado && (
            <Button
              variant="outline"
              disabled={ocupado !== null}
              onClick={() =>
                void accion(i.id, async () => {
                  await api(`/informes/${i.id}/correo`, { method: 'POST' })
                  setMensaje('El informe se envió a los superadministradores activos.')
                })
              }
            >
              <Mail aria-hidden="true" />
              Enviar correo
            </Button>
          )}
          {esSuper && !i.prueba && i.estado === 'ERROR' && (
            <Button
              variant="outline"
              disabled={ocupado !== null}
              onClick={() =>
                void accion(i.id, async () => {
                  await api(`/informes/${i.id}/reintentar`, { method: 'POST' })
                })
              }
            >
              Reintentar
            </Button>
          )}
        </div>
      ),
    },
  ]
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          section="informes"
          titulo="Informes mensuales"
          descripcion="El resumen del estudio, conservado mes a mes. Descargá el PDF con la cartera, actividad y resultados del período."
        />
        <Button
          variant="outline"
          disabled={revalidator.state === 'loading' || ocupado !== null}
          onClick={() => void revalidator.revalidate()}
        >
          <RefreshCw aria-hidden="true" />
          Actualizar
        </Button>
      </div>
      {error && (
        <Aviso tipo="error" enfocar className="mb-6">
          {error}
        </Aviso>
      )}
      {mensaje && (
        <Aviso tipo="exito" className="mb-6">
          {mensaje}
        </Aviso>
      )}
      {datos.pruebasHabilitadas && (
        <section
          aria-labelledby="prueba-informe"
          className="mb-8 rounded-xl border bg-card p-5 shadow-card sm:p-6"
        >
          <h2
            id="prueba-informe"
            className="flex items-center gap-3 text-xl font-bold text-primary"
          >
            <FlaskConical aria-hidden="true" />
            Generación manual de prueba
          </h2>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Probá el mismo informe que se genera automáticamente. El mes actual es provisional. La
            prueba queda identificada y no reemplaza al informe oficial.
          </p>
          <form
            className="mt-5 grid items-end gap-5 md:grid-cols-[minmax(12rem,18rem)_1fr_auto]"
            noValidate
            onSubmit={(event) =>
              void handleSubmit((pedido) =>
                accion('generar', async () => {
                  await api('/informes/pruebas', { method: 'POST', body: pedido })
                  setMensaje(
                    'La prueba quedó guardada. Ya podés descargar el PDF desde el listado.',
                  )
                }),
              )(event)
            }
          >
            <TextField
              label="Mes del informe"
              type="month"
              required
              {...register('periodo')}
              error={errors.periodo?.message}
              disabled={ocupado !== null}
            />
            <label className="flex min-h-12 cursor-pointer items-center gap-3">
              <Checkbox {...register('enviarCorreo')} disabled={ocupado !== null} />
              Enviar también a los superadministradores activos
            </label>
            <Button
              type="submit"
              loading={ocupado === 'generar'}
              disabled={ocupado !== null && ocupado !== 'generar'}
            >
              Generar prueba
            </Button>
          </form>
        </section>
      )}
      <section
        className="overflow-hidden rounded-xl border bg-card shadow-card"
        aria-label="Listado de informes"
      >
        <div className="border-b bg-surface-subtle px-6 py-4">
          <h2 className="text-xl font-bold text-primary">Informes disponibles</h2>
          <p className="mt-1 text-base text-muted-foreground">
            Generación automática el día 1 a partir de las 07:00, hora de Argentina. Los PDF
            permanecen privados.
          </p>
        </div>
        <TablaAbm
          filas={datos.informes}
          columnas={columnas}
          clave={(i) => i.id}
          nombre={(i) => `Informe ${i.periodo}`}
          etiqueta="Informes mensuales del estudio"
          vacio={
            <div className="mx-auto grid max-w-lg justify-items-center gap-3">
              <FileChartColumn className="size-10 text-primary" aria-hidden="true" />
              <p className="text-xl font-bold">Todavía no hay informes</p>
              <p>
                El primer informe se generará al terminar el mes. Si habilitaste las pruebas, podés
                generar uno desde el panel superior.
              </p>
            </div>
          }
        />
      </section>
      <Paginacion
        pagina={datos.pagina}
        porPagina={20}
        total={datos.total}
        nombre="informes"
        hrefPagina={(pagina) =>
          `${basePath}/informes?${new URLSearchParams({ ...Object.fromEntries(params), pagina: String(pagina) })}`
        }
      />
    </div>
  )
}
