import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { CircleCheck, RotateCcw, UploadCloud, X } from 'lucide-react'
import { DOCUMENTO_ACCEPT, DOCUMENTO_FORMATOS } from '@cova/shared/schemas/documentos'
import { Button } from '@/components/ui/button'
import { IconoArchivo } from '@/features/plantillas/components/icono-archivo'
import { formatoTamanoArchivo } from '@/features/plantillas/formato-archivo'
import { cn } from '@/lib/utils'
import { ColaDocumentos, type EstadoCarga } from '../documentos/cola-documentos'
import { comprimirDocumento, enviarDocumento } from '../documentos/transporte'

const etiquetas: Record<EstadoCarga, string> = {
  pendiente: 'En espera',
  comprimiendo: 'Comprimiendo sin pérdida…',
  subiendo: 'Enviando…',
  guardando: 'Guardando en el expediente…',
  completo: 'Documento guardado',
  error: 'No se pudo cargar',
}
export function CargaDocumentos({
  idSiniestro,
  onSubido,
}: {
  idSiniestro: number
  onSubido: () => void
}) {
  const id = useId()
  const selector = useRef<HTMLInputElement>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [cola] = useState(
    () =>
      new ColaDocumentos({
        preparar: comprimirDocumento,
        enviar: (fila, preparado, progreso, guardando, signal) =>
          enviarDocumento(
            idSiniestro,
            fila.id,
            fila.archivo,
            preparado,
            progreso,
            guardando,
            signal,
          ),
        guardado: onSubido,
      }),
  )
  const filas = useSyncExternalStore(cola.suscribir, cola.instantanea, cola.instantanea)
  useEffect(() => {
    cola.activar()
    return () => cola.cerrar()
  }, [cola])
  const pendientes = filas.filter((f) => !['completo', 'error'].includes(f.estado)).length
  const completos = filas.filter((f) => f.estado === 'completo').length
  const fallidos = filas.filter((f) => f.estado === 'error').length
  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className="mb-6 grid gap-4 rounded-xl border-2 border-line bg-surface-subtle p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 id={`${id}-titulo`} className="text-xl font-bold text-primary">
            Adjuntar documentos
          </h3>
          <p className="text-muted-foreground">
            Se envía un archivo por vez. Podés reintentar cada carga sin perder las demás.
          </p>
        </div>
        <Button type="button" onClick={() => selector.current?.click()}>
          <UploadCloud aria-hidden="true" />
          Elegir archivos
        </Button>
      </div>
      <input
        ref={selector}
        type="file"
        multiple
        accept={DOCUMENTO_ACCEPT}
        aria-label="Seleccionar documentos del siniestro"
        className="sr-only"
        onChange={(e) => {
          cola.agregar(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastrando(false)
          cola.agregar(Array.from(e.dataTransfer.files))
        }}
        className={cn(
          'grid justify-items-center gap-2 rounded-lg border-2 border-dashed border-line-strong bg-card px-4 py-6 text-center',
          arrastrando && 'border-primary bg-info-bg',
        )}
      >
        <UploadCloud className="size-8 text-primary" aria-hidden="true" />
        <p className="font-semibold">Arrastrá los archivos acá o usá Elegir archivos</p>
        <p className="text-muted-foreground">{DOCUMENTO_FORMATOS}. Hasta 10 MB por archivo.</p>
        <p className="text-sm text-muted-foreground">
          Compresión sin pérdida durante el envío. Se conserva el archivo original.
        </p>
      </div>
      {filas.length > 0 && (
        <>
          <p role="status" className="font-semibold">
            {completos} guardados · {pendientes} pendientes · {fallidos} con error
          </p>
          <ul className="grid gap-3" aria-label="Progreso de las cargas">
            {filas.map((f) => (
              <li key={f.id} className="grid gap-3 rounded-lg border-2 border-line bg-card p-4">
                <div className="flex items-start gap-3">
                  <IconoArchivo extension={f.archivo.name.split('.').pop() ?? ''} />
                  <div className="grid min-w-0 flex-1 gap-1">
                    <p className="font-bold [overflow-wrap:anywhere]">{f.archivo.name}</p>
                    <p className="text-muted-foreground">{formatoTamanoArchivo(f.archivo.size)}</p>
                  </div>
                  {f.estado === 'completo' && (
                    <CircleCheck className="size-6 shrink-0 text-ok-ink" aria-label="Guardado" />
                  )}
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold">{etiquetas[f.estado]}</span>
                  {['subiendo', 'guardando', 'completo'].includes(f.estado) && (
                    <span className="dato">{f.progreso}%</span>
                  )}
                </div>
                <progress
                  aria-label={`Progreso de ${f.archivo.name}`}
                  max={100}
                  value={f.progreso}
                  className="h-3 w-full appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
                />
                {f.error && (
                  <p role="alert" className="font-semibold text-danger-ink">
                    {f.error}
                  </p>
                )}
                {['error', 'completo', 'pendiente'].includes(f.estado) && (
                  <div className="flex flex-wrap justify-end gap-2">
                    {f.estado === 'error' && f.reintentable && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => cola.reintentar(f.id)}
                        aria-label={`Reintentar ${f.archivo.name}`}
                      >
                        <RotateCcw aria-hidden="true" />
                        Reintentar
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => cola.quitar(f.id)}
                      aria-label={`Quitar ${f.archivo.name} de la cola`}
                    >
                      <X aria-hidden="true" />
                      {f.estado === 'completo' ? 'Ocultar de la cola' : 'Quitar de la cola'}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
