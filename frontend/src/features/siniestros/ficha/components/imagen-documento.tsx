import { rutaArchivoDocumento } from '../documentos/rutas'
import { VistaImagenOriginal } from './vista-imagen-original'
import { lazy, Suspense, useState } from 'react'
const VistaPdfDocumento = lazy(() => import('./vista-pdf-documento'))
import { Download, ImageOff, Maximize2 } from 'lucide-react'
import type { DocumentoFicha } from '@cova/shared/schemas/ficha-siniestro'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { IconoArchivo } from '@/features/plantillas/components/icono-archivo'

export function ImagenDocumento({
  documento,
  idSiniestro,
}: {
  documento: DocumentoFicha
  idSiniestro: number
}) {
  const [error, setError] = useState(false)
  const imagen = documento.imagen
  const esPdf = documento.tipoExtension.toLowerCase() === 'pdf'
  if (!esPdf && !['jpg', 'jpeg', 'png', 'webp'].includes(documento.tipoExtension.toLowerCase()))
    return <IconoArchivo extension={documento.tipoExtension} />
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Ver ${documento.nombreOriginal}`}
          className="group relative grid h-44 w-full place-items-center overflow-hidden rounded-lg border-2 border-line bg-surface-subtle transition-colors hover:border-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {error || !imagen ? (
            <span className="grid justify-items-center gap-2 p-4 text-muted-foreground">
              {error ? (
                <ImageOff aria-hidden="true" className="size-8" />
              ) : (
                <IconoArchivo extension={documento.tipoExtension} />
              )}
              {!esPdf && <span>Ampliar imagen</span>}
            </span>
          ) : (
            <img
              src={rutaArchivoDocumento(
                idSiniestro,
                documento.id,
                'miniatura',
                documento.eliminado,
              )}
              alt={`Miniatura de ${documento.nombreOriginal}`}
              width={300}
              height={Math.max(1, Math.round((300 * imagen.alto) / imagen.ancho))}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setError(true)}
              className="h-full max-h-44 w-full object-contain p-2"
            />
          )}
          <span className="absolute right-2 bottom-2 inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 font-semibold text-primary">
            <Maximize2 aria-hidden="true" className="size-4" />
            {esPdf ? 'Ver PDF' : 'Ampliar'}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent size="wide" className="min-w-0 grid-cols-1 sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="break-words">{documento.nombreOriginal}</DialogTitle>
          <DialogDescription>
            {documento.eliminado && 'Documento dado de baja. '}
            {esPdf
              ? 'Leé el PDF aquí, sin guardarlo en tu equipo. Podés cambiar de página y ampliar.'
              : 'Imagen guardada en el expediente. Ajustá el tamaño o usá el zoom para leer los detalles.'}
          </DialogDescription>
        </DialogHeader>
        {esPdf ? (
          <Suspense fallback={<p role="status">Preparando visor…</p>}>
            <VistaPdfDocumento
              ruta={rutaArchivoDocumento(
                idSiniestro,
                documento.id,
                'contenido',
                documento.eliminado,
              )}
            />
          </Suspense>
        ) : (
          <VistaImagenOriginal key={documento.id} documento={documento} idSiniestro={idSiniestro} />
        )}
        <Button asChild>
          <a
            href={rutaArchivoDocumento(idSiniestro, documento.id, 'original', documento.eliminado)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download aria-hidden="true" />
            Descargar archivo
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  )
}
