import { rutaArchivoDocumento } from '../documentos/rutas'
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

function Vista({ documento, idSiniestro }: { documento: DocumentoFicha; idSiniestro: number }) {
  const [error, setError] = useState(false)
  return error ? (
    <div
      role="status"
      className="grid min-h-40 justify-items-center gap-3 rounded-lg border bg-muted p-6 text-center"
    >
      <ImageOff aria-hidden="true" className="size-8" />
      <p>No se pudo cargar la vista. Podés descargar el archivo original.</p>
    </div>
  ) : (
    <img
      src={rutaArchivoDocumento(idSiniestro, documento.id, 'vista')}
      alt={`Vista de ${documento.nombreOriginal}`}
      referrerPolicy="no-referrer"
      onError={() => setError(true)}
      className="max-h-[65dvh] w-full rounded-lg bg-muted object-contain"
    />
  )
}

export function ImagenDocumento({
  documento,
  idSiniestro,
}: {
  documento: DocumentoFicha
  idSiniestro: number
}) {
  const [error, setError] = useState(false)
  const imagen = documento.imagen
  if (!imagen) return <IconoArchivo extension={documento.tipoExtension} />
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Ampliar ${documento.nombreOriginal}`}
          className="group relative grid h-44 w-full place-items-center overflow-hidden rounded-lg border-2 border-line bg-surface-subtle transition-colors hover:border-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {error ? (
            <span className="grid justify-items-center gap-2 p-4 text-muted-foreground">
              <ImageOff aria-hidden="true" className="size-8" />
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
      <DialogContent size="wide">
        <DialogHeader>
          <DialogTitle className="break-words">{documento.nombreOriginal}</DialogTitle>
          <DialogDescription>
            Vista de {imagen.ancho} × {imagen.alto} px. El original conserva todos los detalles.
          </DialogDescription>
        </DialogHeader>
        <Vista documento={documento} idSiniestro={idSiniestro} />
        <p className="text-muted-foreground">
          Para leer texto pequeño o ampliar detalles, descargá el original de {imagen.anchoOriginal}{' '}
          × {imagen.altoOriginal} px.
        </p>
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
