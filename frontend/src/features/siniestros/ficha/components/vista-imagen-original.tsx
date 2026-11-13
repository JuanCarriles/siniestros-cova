import { useRef, useState } from 'react'
import { ImageOff, LoaderCircle, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import type { DocumentoFicha } from '@cova/shared/schemas/ficha-siniestro'
import { Button } from '@/components/ui/button'
import { rutaArchivoDocumento } from '../documentos/rutas'

/** El visor y la descarga usan el archivo principal guardado, con ajuste y zoom sin ampliación automática. */
export function VistaImagenOriginal({
  documento,
  idSiniestro,
}: {
  documento: DocumentoFicha
  idSiniestro: number
}) {
  const imagen = useRef<HTMLImageElement>(null)
  const [zoom, setZoom] = useState<number | null>(null)
  const [cargada, setCargada] = useState(false)
  const [error, setError] = useState(false)
  const [intento, setIntento] = useState(0)
  const [medidas, setMedidas] = useState({
    ancho: documento.imagen?.ancho ?? 0,
    alto: documento.imagen?.alto ?? 0,
  })
  const original = rutaArchivoDocumento(idSiniestro, documento.id, 'original', documento.eliminado)

  function acercar(factor: number) {
    const actual =
      zoom ?? (imagen.current?.getBoundingClientRect().width ?? medidas.ancho) / medidas.ancho
    setZoom(Math.min(4, Math.max(0.1, Math.round(actual * factor * 100) / 100)))
  }

  if (error)
    return (
      <div
        role="status"
        className="grid min-h-40 justify-items-center gap-3 rounded-lg border bg-muted p-6 text-center"
      >
        <ImageOff aria-hidden="true" className="size-8" />
        <p>No se pudo cargar la imagen del expediente. Podés reintentar o descargarla.</p>
        <Button
          variant="outline"
          onClick={() => {
            setError(false)
            setCargada(false)
            setIntento((n) => n + 1)
          }}
        >
          <RotateCcw aria-hidden="true" />
          Reintentar imagen
        </Button>
      </div>
    )

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      <div
        role="group"
        aria-label="Tamaño de la imagen"
        className="flex flex-wrap items-center gap-2"
      >
        <Button
          variant={zoom === null ? 'default' : 'outline'}
          size="sm"
          aria-pressed={zoom === null}
          onClick={() => setZoom(null)}
        >
          Ajustar
        </Button>
        <Button
          variant={zoom === 1 ? 'default' : 'outline'}
          size="sm"
          aria-pressed={zoom === 1}
          disabled={!cargada}
          onClick={() => setZoom(1)}
        >
          Tamaño real
        </Button>
        <div className="inline-flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Alejar imagen"
            disabled={!cargada || (zoom !== null && zoom <= 0.1)}
            onClick={() => acercar(0.8)}
          >
            <ZoomOut aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Acercar imagen"
            disabled={!cargada || (zoom !== null && zoom >= 4)}
            onClick={() => acercar(1.25)}
          >
            <ZoomIn aria-hidden="true" />
          </Button>
          <output
            aria-label="Nivel de zoom"
            aria-live="polite"
            className="min-w-16 px-1 font-semibold text-primary"
          >
            {zoom === null ? 'Ajustada' : `${Math.round(zoom * 100)}%`}
          </output>
        </div>
      </div>
      {!cargada && (
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          Cargando imagen del expediente…
        </p>
      )}
      <div
        tabIndex={0}
        role="region"
        aria-label="Imagen del expediente; al ampliar podés desplazarte horizontal y verticalmente"
        aria-busy={!cargada}
        className="max-h-[55dvh] min-h-40 min-w-0 overflow-auto overscroll-contain rounded-lg border-2 border-line bg-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <img
          ref={imagen}
          src={
            intento
              ? `${original}${original.includes('?') ? '&' : '?'}intento=${intento}`
              : original
          }
          alt={`Imagen del expediente de ${documento.nombreOriginal}`}
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            const img = e.currentTarget
            setMedidas({ ancho: img.naturalWidth, alto: img.naturalHeight })
            setCargada(true)
          }}
          onError={() => setError(true)}
          className={zoom === null ? 'mx-auto block h-auto w-auto max-w-full' : 'block max-w-none'}
          style={
            zoom === null
              ? { maxHeight: '55dvh' }
              : {
                  width: Math.round(medidas.ancho * zoom),
                  height: Math.round(medidas.alto * zoom),
                  maxWidth: 'none',
                  maxHeight: 'none',
                }
          }
        />
      </div>
      <p className="min-w-0 break-words text-muted-foreground">
        {cargada && (
          <span className="block dato">
            Archivo: {medidas.ancho} × {medidas.alto} px.{' '}
          </span>
        )}
        Tamaño real muestra el 100%. Al ampliar, desplazate dentro de la imagen para recorrerla.
      </p>
    </div>
  )
}
