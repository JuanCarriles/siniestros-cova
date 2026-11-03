import { useState } from 'react'
import { useRevalidator } from 'react-router'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Megaphone, Send } from 'lucide-react'
import {
  MAXIMO_NOVEDAD,
  novedadSchema,
  type NovedadData,
  type NovedadInput,
} from '@cova/shared/schemas/novedades'
import { Aviso } from '@/components/aviso'
import { roleLabels } from '@/components/layout/panel-navigation'
import { TextareaField } from '@/components/textarea-field'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { campoDelError, mensajeDelError } from '../../errores-servidor'
import { cargarNovedad } from '../api/ficha.api'
import { PestanaFicha, PestanaVacia } from '../components/pestana-ficha'
import { fechaHoraDe } from '../formato'
import { useFicha, usePestana } from '../hooks/use-ficha'

/** A partir de cuántos caracteres restantes el contador se avisa al lector de pantalla */
const AVISAR_DESDE = 200

// Pestaña "Novedades" (CU-10 1.f y 1.f.1, E5-08): arriba, el campo para cargar una; abajo, las cargadas de la más
// nueva a la más vieja, con su autor, su tipo de usuario y su fecha y hora. La recién cargada aparece justo debajo
// del campo. Cargar una cuenta como movimiento del caso, queda en el historial y avisa al usuario asignado y a la
// administración. Las novedades no se editan ni se borran. Un siniestro cerrado o dado de baja solo se consulta.
export function PestanaNovedades() {
  const ficha = useFicha()
  const novedades = usePestana<'novedades'>()
  const revalidator = useRevalidator()
  const editable = !ficha.fechaBaja && !ficha.estado.esCierre
  const [mensaje, setMensaje] = useState<string | null>(null)
  /** La que cargó esta persona recién: se marca en la lista */
  const [recien, setRecien] = useState<number | null>(null)

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NovedadInput, unknown, NovedadData>({
    resolver: zodResolver(novedadSchema),
    defaultValues: { descripcion: '' },
  })
  const quedan = MAXIMO_NOVEDAD - (useWatch({ control, name: 'descripcion' }) ?? '').length

  const cargar = handleSubmit(async (datos) => {
    setMensaje(null)
    try {
      const { id } = await cargarNovedad(ficha.id, datos)
      // La lista, la cantidad de la pestaña, la cabecera (días sin movimiento) y el historial, al día
      await revalidator.revalidate()
      reset({ descripcion: '' })
      setRecien(id)
      setMensaje('Se cargó la novedad. Se avisó al usuario asignado y a la administración.')
    } catch (err) {
      const mensajeError = mensajeDelError(err, 'No se pudo cargar la novedad. Probá de nuevo.')
      if (campoDelError(err, ['descripcion'] as const))
        setError('descripcion', { message: mensajeError }, { shouldFocus: true })
      else setError('root', { message: mensajeError })
    }
  })

  return (
    <PestanaFicha titulo="Novedades" cantidad={novedades.length}>
      {editable ? (
        <form
          noValidate
          onSubmit={(e) => void cargar(e)}
          aria-label="Cargar una novedad"
          className="mb-6 grid gap-3 rounded-lg border-2 border-l-8 border-line border-l-brand-accent bg-surface-subtle p-4 sm:p-5"
        >
          {errors.root?.message && (
            <Aviso tipo="error" enfocar>
              {errors.root.message}
            </Aviso>
          )}
          <TextareaField
            {...register('descripcion')}
            label="Nueva novedad"
            required
            rows={4}
            maxLength={MAXIMO_NOVEDAD}
            hint="Contá qué hiciste o qué pasó en el caso. Una vez cargada no se puede modificar ni borrar."
            error={errors.descripcion?.message}
            disabled={isSubmitting}
            className="text-lg"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              className={cn(
                'dato text-sm',
                quedan < AVISAR_DESDE ? 'font-semibold text-ink-2' : 'text-muted-foreground',
              )}
              aria-live={quedan < AVISAR_DESDE ? 'polite' : 'off'}
            >
              {quedan === 1 ? 'Queda 1 carácter' : `Quedan ${quedan} caracteres`}
            </p>
            <Button type="submit" loading={isSubmitting}>
              <Send aria-hidden="true" />
              Cargar novedad
            </Button>
          </div>
        </form>
      ) : (
        <Aviso tipo="info" className="mb-5">
          {ficha.fechaBaja
            ? 'Este siniestro está dado de baja: sus novedades se pueden consultar, pero no se cargan nuevas.'
            : 'Este siniestro está cerrado: sus novedades se pueden consultar, pero no se cargan nuevas.'}
        </Aviso>
      )}

      {mensaje && (
        <Aviso tipo="exito" className="mb-5" enfocar>
          {mensaje}
        </Aviso>
      )}

      {novedades.length === 0 ? (
        <PestanaVacia icono={Megaphone}>
          {editable
            ? 'Todavía no se cargaron novedades. La primera que cargues va a aparecer acá.'
            : 'No se cargaron novedades en este siniestro.'}
        </PestanaVacia>
      ) : (
        <ol className="grid gap-4" aria-label="Novedades, de la más nueva a la más vieja">
          {novedades.map((n) => (
            <li
              key={n.id}
              className={cn(
                'rounded-lg border-2 border-l-8 border-l-brand-accent p-4',
                n.id === recien ? 'border-owner-border bg-owner-bg' : 'border-line bg-card',
              )}
            >
              <p className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <strong className="text-lg">{n.autor.nombre}</strong>
                <span className="rounded bg-neutral-bg px-2 text-sm font-semibold text-neutral-ink">
                  {roleLabels[n.autor.tipoUsuario]}
                </span>
                <time dateTime={n.fechaCarga} className="dato text-muted-foreground">
                  {fechaHoraDe(n.fechaCarga)}
                </time>
                {n.id === recien && (
                  <span className="text-sm font-bold text-owner-ink">Recién cargada</span>
                )}
              </p>
              <p className="text-reading whitespace-pre-line">{n.descripcion}</p>
            </li>
          ))}
        </ol>
      )}
    </PestanaFicha>
  )
}
