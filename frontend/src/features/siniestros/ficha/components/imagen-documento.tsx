import { rutaArchivoDocumento } from '../documentos/rutas'
import { VistaImagenOriginal } from './vista-imagen-original'
import { useState } from 'react'
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
  if (!['jpg', 'jpeg', 'png'].includes(documento.tipoExtension.toLowerCase()))
    return <IconoArchivo extension={documento.tipoExtension} />
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Ampliar ${documento.nombreOriginal}`}
          className="group relative grid h-44 w-full place-items-center overflow-hidden rounded-lg border-2 border-line bg-surface-subtle transition-colors hover:border-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {error || !imagen ? (
            <span className="grid justify-items-center gap-2 p-4 text-muted-foreground">
              {error ? (
                <ImageOff aria-hidden="true" className="size-8" />
              ) : (
                <IconoArchivo extension={documento.tipoExtension} />
              )}
              <span>Ampliar imagen</span>
            </span>
          ) : (
            <img
              src={rutaArchivoDocumento(idSiniestro, documento.id, 'miniatura')}
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
            Ampliar
          </span>
        </button>
      </DialogTrigger>
      <DialogContent size="wide" className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="break-words">{documento.nombreOriginal}</DialogTitle>
          <DialogDescription>
            Imagen original, sin recomprimir. Ajustá el tamaño o usá el zoom para leer los detalles.
          </DialogDescription>
        </DialogHeader>
        <VistaImagenOriginal key={documento.id} documento={documento} idSiniestro={idSiniestro} />
        <Button asChild>
          <a
            href={rutaArchivoDocumento(idSiniestro, documento.id, 'original')}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download aria-hidden="true" />
            Descargar original
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  )
}
