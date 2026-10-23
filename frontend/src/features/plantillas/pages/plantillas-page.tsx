import { useEffect, useRef, useState } from 'react'
import { useLoaderData, useRevalidator } from 'react-router'
import { Download, Files, SearchX, Trash2 } from 'lucide-react'
import type { PlantillaListado } from '@cova/shared/schemas/plantillas'
import { BarraAbm } from '@/components/abm/barra-abm'
import { ListadoAbm } from '@/components/abm/listado-abm'
import { TablaAbm, type ColumnaAbm } from '@/components/abm/tabla-abm'
import { Aviso } from '@/components/aviso'
import { SectionHeading } from '@/components/layout/section-heading'
import { usePanel } from '@/components/layout/panel-context'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { normalizarBusqueda, plural } from '@/lib/texto'
import type { cargarPlantillas } from '../loader'
import { descargarPlantilla } from '../plantillas.api'
import { formatoTamanoArchivo } from '../formato-archivo'
import { IconoArchivo } from '../components/icono-archivo'
import { EliminarPlantillaDialog } from '../components/eliminar-plantilla-dialog'
import { CargarPlantillaDialog } from '../components/cargar-plantilla-dialog'

export function PlantillasPage() {
  const { plantillas } = useLoaderData<typeof cargarPlantillas>()
  const { usuario } = usePanel()
  const revalidator = useRevalidator()
  // Al volver desde Cloudflare se consulta el listado y se concilian las eliminaciones.
  useEffect(() => {
    let ultimaConsulta = 0
    const actualizar = () => {
      if (document.visibilityState !== 'visible' || Date.now() - ultimaConsulta < 2000) return
      ultimaConsulta = Date.now()
      void revalidator.revalidate()
    }
    window.addEventListener('focus', actualizar)
    document.addEventListener('visibilitychange', actualizar)
    return () => {
      window.removeEventListener('focus', actualizar)
      document.removeEventListener('visibilitychange', actualizar)
    }
  }, [revalidator])
  const puedeCargar = usuario.tipo !== 'GESTOR'
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(false)
  const [paraEliminar, setParaEliminar] = useState<PlantillaListado | null>(null)
  const origenEliminar = useRef<HTMLButtonElement | null>(null)
  const tituloListado = useRef<HTMLHeadingElement>(null)
  const [descargando, setDescargando] = useState<number | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null)
  const buscado = normalizarBusqueda(busqueda)
  const visibles = plantillas.filter((p) =>
    normalizarBusqueda(`${p.encabezado} ${p.descripcion}`).includes(buscado),
  )

  async function descargar(p: PlantillaListado) {
    setDescargando(p.id)
    setAviso(null)
    try {
      await descargarPlantilla(p.id)
    } catch (error) {
      setAviso({
        tipo: 'error',
        texto: error instanceof ApiError ? error.message : 'No se pudo descargar la plantilla.',
      })
    } finally {
      setDescargando(null)
    }
  }
  const columnas: ColumnaAbm<PlantillaListado>[] = [
    {
      id: 'plantilla',
      encabezado: 'Plantilla',
      principal: true,
      celda: (p) => (
        <div className="grid max-w-sm gap-2">
          <div>
            <IconoArchivo extension={p.tipoExtension} />
          </div>
          <span className="break-words">{p.encabezado}</span>
          <span className="font-normal break-all text-muted-foreground">{p.nombreOriginal}</span>
        </div>
      ),
    },
    {
      id: 'descripcion',
      encabezado: 'Descripción',
      celda: (p) => (
        <p className="max-w-md break-words whitespace-pre-wrap">
          {p.descripcion || 'Sin descripción'}
        </p>
      ),
    },
    {
      id: 'tamano',
      encabezado: 'Tamaño',
      celda: (p) =>
        p.tamanoBytes === null ? 'No registrado' : formatoTamanoArchivo(p.tamanoBytes),
    },
    {
      id: 'carga',
      encabezado: 'Cargada',
      celda: (p) => (
        <div className="grid gap-1">
          <time dateTime={p.fechaCarga}>
            {new Date(p.fechaCarga).toLocaleString('es-AR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
          <span className="text-muted-foreground">
            por {p.subidoPor.nombres} {p.subidoPor.apellidos}
          </span>
        </div>
      ),
    },
    {
      id: 'acciones',
      encabezado: 'Acciones',
      celda: (p) => (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={descargando !== null}
            onClick={() => void descargar(p)}
            aria-label={`Descargar ${p.encabezado}`}
          >
            <Download aria-hidden="true" />
            {descargando === p.id ? 'Preparando…' : 'Descargar'}
          </Button>
          {puedeCargar && (
            <Button
              variant="ghost"
              className="text-danger-ink hover:bg-danger-bg hover:text-danger-ink"
              aria-label={`Eliminar ${p.encabezado}`}
              onClick={(evento) => {
                origenEliminar.current = evento.currentTarget
                setAviso(null)
                setParaEliminar(p)
              }}
            >
              <Trash2 aria-hidden="true" />
              Eliminar
            </Button>
          )}
        </div>
      ),
    },
  ]
  return (
    <>
      <SectionHeading
        section="plantillas"
        titulo="Plantillas de documentos"
        descripcion="Modelos que el equipo usa en sus siniestros. Descargá una copia para completarla."
      />
      <BarraAbm
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholderBusqueda="Buscar por encabezado o descripción"
        etiquetaAlta={puedeCargar ? 'Cargar plantilla' : undefined}
        onAlta={
          puedeCargar
            ? () => {
                setAviso(null)
                setCargando(true)
              }
            : undefined
        }
      />
      <ListadoAbm
        tituloRef={tituloListado}
        titulo={plural(visibles.length, 'plantilla')}
        aviso={aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
        nota={
          puedeCargar
            ? 'Formatos permitidos: PDF, JPG, PNG, DOCX y XLSX. Hasta 10 MB por archivo. La fecha y el autor se registran automáticamente.'
            : 'Podés consultar y descargar las plantillas. La carga está a cargo de los administradores.'
        }
      >
        <TablaAbm
          filas={visibles}
          columnas={columnas}
          clave={(p) => p.id}
          nombre={(p) => p.encabezado}
          etiqueta="Listado de plantillas"
          vacio={
            <div className="grid justify-items-center gap-3">
              {buscado ? (
                <SearchX className="size-9 text-muted-foreground" aria-hidden="true" />
              ) : (
                <Files className="size-9 text-muted-foreground" aria-hidden="true" />
              )}
              <p className="font-semibold">
                {buscado
                  ? 'No hay plantillas que coincidan con la búsqueda.'
                  : 'Todavía no hay plantillas cargadas.'}
              </p>
              <p className="text-muted-foreground">
                {buscado
                  ? 'Probá con otro encabezado o descripción.'
                  : puedeCargar
                    ? 'Agregá la primera con «Cargar plantilla».'
                    : 'Un administrador debe cargar los documentos para que puedas descargarlos.'}
              </p>
            </div>
          }
        />
      </ListadoAbm>
      {paraEliminar && (
        <EliminarPlantillaDialog
          key={paraEliminar.id}
          plantilla={paraEliminar}
          onCerrar={() => setParaEliminar(null)}
          onHecho={(texto) => {
            setParaEliminar(null)
            setAviso({ tipo: 'exito', texto })
            void revalidator.revalidate()
          }}
          elementoAlCerrar={(eliminada) =>
            !eliminada && origenEliminar.current?.isConnected
              ? origenEliminar.current
              : tituloListado.current
          }
        />
      )}
      {cargando && (
        <CargarPlantillaDialog
          onCerrar={() => setCargando(false)}
          onGuardada={(texto) => {
            setCargando(false)
            setAviso({ tipo: 'exito', texto })
            void revalidator.revalidate()
          }}
        />
      )}
    </>
  )
}
