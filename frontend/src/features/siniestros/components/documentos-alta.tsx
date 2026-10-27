import { useId, useRef, useState } from 'react'
import { FileStack, RotateCcw, UploadCloud } from 'lucide-react'
import {
  PLANTILLA_ACCEPT,
  PLANTILLA_FORMATOS,
  errorArchivoPlantilla,
} from '@cova/shared/schemas/plantillas'
import type { DocumentoAlta } from '@cova/shared/schemas/siniestros-alta'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { IconoArchivo } from '@/features/plantillas/components/icono-archivo'
import { formatoTamanoArchivo } from '@/features/plantillas/formato-archivo'
import { quitarDocumentoAlta, subirDocumentoAlta } from '../api/siniestros.api'
import { BotonQuitar } from './tarjeta-persona'

// Paso 5 del alta (CU-09 pasos 32-34, E4-10): documentos del siniestro, de a uno. Cada uno se sube a R2 al
// elegirlo; si el formato o el tamaño no sirven (33.a, 33.b) o R2 falla (34.a), se avisa y se puede reintentar o
// seguir sin él. Se puede crear el siniestro sin documentos (32.a).
export function DocumentosAlta({
  documentos,
  onCambiar,
}: {
  documentos: DocumentoAlta[]
  onCambiar: (documentos: DocumentoAlta[]) => void
}) {
  const id = useId()
  const selector = useRef<HTMLInputElement>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [error, setError] = useState<{ mensaje: string; reintentar?: File } | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function subir(archivo: File) {
    setMensaje(null)
    const invalido = errorArchivoPlantilla(archivo)
    if (invalido) return setError({ mensaje: `«${archivo.name}»: ${invalido}` })
    setError(null)
    setSubiendo(archivo.name)
    try {
      const documento = await subirDocumentoAlta(archivo)
      onCambiar([...documentos, documento])
      setMensaje(`Se cargó «${documento.nombreOriginal}».`)
    } catch (err) {
      const servidor = err instanceof ApiError
      setError({
        mensaje: `«${archivo.name}»: ${servidor ? err.message : 'No se pudo cargar. Revisá la conexión.'}`,
        // Si el archivo era válido y falló el guardado (34.a), se puede reintentar sin volver a elegirlo
        reintentar: !servidor || err.status >= 500 ? archivo : undefined,
      })
    } finally {
      setSubiendo(null)
    }
  }
  function elegir(archivos: FileList | null) {
    if (!archivos?.length || subiendo) return
    if (archivos.length > 1)
      return setError({
        mensaje: 'Los documentos se cargan de a uno: arrastrá o elegí un solo archivo.',
      })
    void subir(archivos[0])
  }
  async function quitar(documento: DocumentoAlta) {
    setMensaje(null)
    setError(null)
    try {
      await quitarDocumentoAlta(documento.clave)
      onCambiar(documentos.filter((d) => d.clave !== documento.clave))
      setMensaje(`Se quitó «${documento.nombreOriginal}».`)
    } catch (err) {
      setError({
        mensaje: `No se pudo quitar «${documento.nombreOriginal}»: ${err instanceof ApiError ? err.message : 'revisá la conexión'}. Probá de nuevo.`,
      })
    }
  }

  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className="rounded-xl border bg-card p-5 shadow-card sm:p-6"
    >
      <div className="mb-5 grid gap-1">
        <h2 id={`${id}-titulo`} className="flex items-center gap-3 text-xl font-bold text-primary">
          <span
            className="grid size-10 place-items-center rounded-lg bg-callout-bg"
            aria-hidden="true"
          >
            <FileStack className="size-5" />
          </span>
          Documentos
          <span className="font-normal text-muted-foreground">({documentos.length})</span>
        </h2>
        <p className="text-muted-foreground">
          Denuncia, fotos, presupuestos… Si todavía no tenés documentos, podés crear el siniestro
          sin cargarlos.
        </p>
      </div>

      <div
        className={cn(
          'grid justify-items-center gap-3 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
          arrastrando ? 'border-primary bg-info-bg' : 'border-input bg-surface-subtle',
        )}
        onDragOver={(e) => {
          e.preventDefault()
          if (!subiendo) setArrastrando(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastrando(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setArrastrando(false)
          elegir(e.dataTransfer.files)
        }}
      >
        <UploadCloud className="size-9 text-primary" aria-hidden="true" />
        <p className="text-lg font-semibold">Arrastrá un documento acá</p>
        <Button
          type="button"
          variant="outline"
          loading={!!subiendo}
          aria-describedby={`${id}-formatos`}
          onClick={() => selector.current?.click()}
        >
          Elegir archivo
        </Button>
        <input
          ref={selector}
          type="file"
          tabIndex={-1}
          className="sr-only"
          accept={PLANTILLA_ACCEPT}
          aria-hidden="true"
          onChange={(e) => {
            elegir(e.currentTarget.files)
            e.currentTarget.value = ''
          }}
        />
        <p id={`${id}-formatos`} className="text-muted-foreground">
          De a uno. {PLANTILLA_FORMATOS}. Máximo 10 MB por archivo.
        </p>
      </div>

      <div className="mt-3 grid gap-2" aria-live="polite">
        {subiendo && (
          <p role="status" className="font-semibold text-primary">
            Cargando «{subiendo}»…
          </p>
        )}
        {mensaje && <p className="font-semibold text-ok-ink">{mensaje}</p>}
      </div>
      {error && (
        <div
          role="alert"
          className="mt-2 flex flex-wrap items-center gap-3 rounded-md border-2 border-destructive bg-danger-bg px-3 py-2 font-semibold text-danger-ink"
        >
          <p className="min-w-0 flex-1 break-words">{error.mensaje}</p>
          {error.reintentar && (
            <Button
              type="button"
              variant="outline"
              onClick={() => error.reintentar && void subir(error.reintentar)}
            >
              <RotateCcw aria-hidden="true" />
              Reintentar
            </Button>
          )}
        </div>
      )}

      {documentos.length > 0 && (
        <ul className="mt-4 grid gap-2">
          {documentos.map((d) => (
            <li
              key={d.clave}
              className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-line-strong bg-surface-subtle px-4 py-3"
            >
              <IconoArchivo extension={d.tipoExtension} />
              <span className="grid min-w-0 flex-1">
                <span className="font-semibold break-all">{d.nombreOriginal}</span>
                <span className="text-muted-foreground">{formatoTamanoArchivo(d.tamanoBytes)}</span>
              </span>
              <BotonQuitar etiqueta={`Quitar ${d.nombreOriginal}`} onClick={() => void quitar(d)}>
                Quitar
              </BotonQuitar>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
