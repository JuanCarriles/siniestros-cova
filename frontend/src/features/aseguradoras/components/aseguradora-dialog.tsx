import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  aseguradoraSchema,
  type AseguradoraData,
  type AseguradoraInput,
  type AseguradoraListado,
} from '@cova/shared/schemas/aseguradoras'
import { Aviso } from '@/components/aviso'
import { TextField } from '@/components/text-field'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ApiError } from '@/lib/api'
import { crearAseguradora, modificarAseguradora } from '../api/aseguradoras.api'

export type EdicionAseguradora =
  { tipo: 'nueva' } | { tipo: 'modificar'; aseguradora: AseguradoraListado }

// CU-02 pasos 3 a 6 (alta) y 3.b (modificación), en un modal. Valida con el mismo esquema que el backend; el
// nombre repetido lo detecta el servidor y se muestra debajo del campo.
export function AseguradoraDialog({
  abierto,
  elementoAlCerrar,
  edicion,
  onCerrar,
  onGuardada,
}: {
  /** Separado de "edicion": al cerrar, el contenido no cambia durante la animación de salida */
  abierto: boolean
  /** Dónde poner el foco al cerrar (el ⋮ de la fila); sin él, Radix lo devuelve a lo que estaba enfocado */
  elementoAlCerrar?: () => HTMLElement | null
  edicion: EdicionAseguradora | null
  onCerrar: () => void
  onGuardada: (mensaje: string) => void
}) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<AseguradoraInput, unknown, AseguradoraData>({
    resolver: zodResolver(aseguradoraSchema),
    defaultValues: { nombre: '' },
  })

  useEffect(() => {
    if (abierto && edicion) {
      reset({ nombre: edicion.tipo === 'modificar' ? edicion.aseguradora.nombre : '' })
    }
  }, [abierto, edicion, reset])

  const guardar = handleSubmit(async (datos) => {
    if (!edicion) return
    try {
      if (edicion.tipo === 'nueva') {
        const creada = await crearAseguradora(datos)
        onGuardada(`Se creó la aseguradora ${creada.nombre}.`)
      } else {
        const modificada = await modificarAseguradora(edicion.aseguradora.id, datos)
        onGuardada(`Se guardaron los cambios de ${modificada.nombre}.`)
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('nombre', { message: err.message }, { shouldFocus: true })
      } else {
        setError('root', {
          message: err instanceof ApiError ? err.message : 'No se pudo guardar. Probá de nuevo.',
        })
      }
    }
  })

  const esNueva = edicion?.tipo !== 'modificar'
  return (
    <Dialog
      open={abierto}
      onOpenChange={(abrir) => {
        if (!abrir && !isSubmitting) onCerrar()
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          const elemento = elementoAlCerrar?.()
          if (elemento) {
            event.preventDefault()
            elemento.focus()
          }
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          setFocus('nombre', { shouldSelect: !esNueva })
        }}
      >
        <DialogHeader>
          <DialogTitle>{esNueva ? 'Nueva aseguradora' : 'Modificar aseguradora'}</DialogTitle>
          <DialogDescription>
            {esNueva
              ? 'Va a quedar disponible para asignar ajustadores y siniestros.'
              : 'El nuevo nombre se va a ver en sus ajustadores y siniestros.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void guardar(e)} noValidate className="grid gap-5">
          {errors.root?.message && <Aviso tipo="error">{errors.root.message}</Aviso>}
          <TextField
            label="Nombre de la aseguradora"
            required
            autoComplete="off"
            placeholder="Ej.: Federación Patronal"
            hint="Entre 3 y 60 caracteres. No puede repetirse."
            error={errors.nombre?.message}
            {...register('nombre')}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={isSubmitting}>
              {isSubmitting ? 'Guardando…' : esNueva ? 'Crear aseguradora' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
