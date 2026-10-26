import { useId, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { UploadCloud, X } from 'lucide-react'
import {
  altaPlantillaSchema,
  errorArchivoPlantilla,
  PLANTILLA_ACCEPT,
  PLANTILLA_FORMATOS,
  type AltaPlantillaInput,
  type AltaPlantillaData,
} from '@cova/shared/schemas/plantillas'
import { Aviso } from '@/components/aviso'
import { TextField } from '@/components/text-field'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { subirPlantilla } from '../plantillas.api'
import { formatoTamanoArchivo } from '../formato-archivo'
import { IconoArchivo } from './icono-archivo'

export function CargarPlantillaDialog({
  onCerrar,
  onGuardada,
}: {
  onCerrar: () => void
  onGuardada: (mensaje: string) => void
}) {
  const id = useId()
  const selector = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AltaPlantillaInput, unknown, AltaPlantillaData>({
    resolver: zodResolver(altaPlantillaSchema),
    defaultValues: { encabezado: '', descripcion: '' },
  })

  function seleccionar(archivos: FileList | null) {
    if (isSubmitting || !archivos?.length) return
    setArchivo(null)
    if (archivos.length !== 1) {
      setErrorArchivo('Elegí un único archivo por plantilla.')
      return
    }
    const elegido = archivos[0]
    const error = errorArchivoPlantilla(elegido)
    setErrorArchivo(error)
    if (!error) setArchivo(elegido)
  }
  const guardar = handleSubmit(async (datos) => {
    if (!archivo) {
      setErrorArchivo('Elegí el archivo que querés cargar.')
      document.getElementById(`${id}-elegir`)?.focus()
      return
    }
    try {
      const creada = await subirPlantilla(datos, archivo)
      onGuardada(`Se cargó la plantilla «${creada.encabezado}».`)
    } catch (error) {
      setError('root', {
        message:
          error instanceof ApiError
            ? error.message
            : 'No se pudo cargar la plantilla. Probá de nuevo.',
      })
    }
  })

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !isSubmitting) onCerrar()
      }}
    >
      <DialogContent showCloseButton={!isSubmitting} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Cargar plantilla</DialogTitle>
          <DialogDescription>
            Agregá un documento de referencia para que el equipo pueda descargarlo.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => void guardar(e)}
          noValidate
          className="grid gap-5"
          aria-busy={isSubmitting}
        >
          <fieldset disabled={isSubmitting} className="grid min-w-0 gap-5">
            <legend className="sr-only">Datos de la plantilla</legend>
            <TextField
              label="Encabezado"
              required
              autoFocus
              maxLength={120}
              placeholder="Por ejemplo: Carta documento a tercero"
              {...register('encabezado')}
              error={errors.encabezado?.message}
            />
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-descripcion`}>
                Descripción <span className="font-normal text-muted-foreground">(obligatoria)</span>
              </Label>
              <Textarea
                id={`${id}-descripcion`}
                rows={3}
                required
                maxLength={1000}
                placeholder="Indicá para qué se usa este documento."
                {...register('descripcion')}
                aria-invalid={!!errors.descripcion}
                aria-describedby={errors.descripcion ? `${id}-error-descripcion` : undefined}
              />
              {errors.descripcion && (
                <p id={`${id}-error-descripcion`} className="font-semibold text-destructive">
                  {errors.descripcion.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-archivo`}>
                Archivo <span className="font-normal text-muted-foreground">(obligatorio)</span>
              </Label>
              <div
                className={cn(
                  'grid justify-items-center gap-3 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors',
                  arrastrando ? 'border-primary bg-info-bg' : 'border-input bg-surface-subtle',
                  errorArchivo && 'border-destructive',
                )}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!isSubmitting) setArrastrando(true)
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                    setArrastrando(false)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  setArrastrando(false)
                  seleccionar(e.dataTransfer.files)
                }}
              >
                {archivo ? (
                  <IconoArchivo extension={archivo.name.split('.').pop() ?? ''} />
                ) : (
                  <UploadCloud className="size-8 text-primary" aria-hidden="true" />
                )}
                <p className="font-semibold">
                  {archivo ? 'Archivo seleccionado' : 'Arrastrá tu documento acá'}
                </p>
                {archivo && (
                  <p className="max-w-full break-all">
                    {archivo.name} · {formatoTamanoArchivo(archivo.size)}
                  </p>
                )}
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    id={`${id}-elegir`}
                    aria-describedby={`${id}-formatos${errorArchivo ? ` ${id}-error-archivo` : ''}`}
                    onClick={() => selector.current?.click()}
                  >
                    {archivo ? 'Elegir otro archivo' : 'Elegir archivo'}
                  </Button>
                  {archivo && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setArchivo(null)
                        setErrorArchivo(null)
                      }}
                    >
                      <X aria-hidden="true" />
                      Quitar
                    </Button>
                  )}
                </div>
                <input
                  ref={selector}
                  id={`${id}-archivo`}
                  type="file"
                  tabIndex={-1}
                  className="sr-only"
                  accept={PLANTILLA_ACCEPT}
                  aria-describedby={`${id}-formatos${errorArchivo ? ` ${id}-error-archivo` : ''}`}
                  aria-invalid={!!errorArchivo}
                  onChange={(e) => {
                    seleccionar(e.currentTarget.files)
                    e.currentTarget.value = ''
                  }}
                />
                <p id={`${id}-formatos`} className="text-muted-foreground">
                  {PLANTILLA_FORMATOS}. Máximo 10 MB por archivo.
                </p>
              </div>
              {errorArchivo && (
                <p
                  id={`${id}-error-archivo`}
                  role="alert"
                  className="font-semibold text-destructive"
                >
                  {errorArchivo}
                </p>
              )}
            </div>
          </fieldset>
          {errors.root && (
            <Aviso tipo="error" enfocar>
              {errors.root.message}
            </Aviso>
          )}
          {isSubmitting && (
            <p role="status" className="font-semibold text-primary">
              Validando y cargando el documento…
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              <UploadCloud aria-hidden="true" />
              Confirmar carga
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
