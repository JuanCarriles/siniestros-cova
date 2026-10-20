import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ajustadorSchema,
  campoConflictoAjustadorSchema,
  type AjustadorData,
  type AjustadorInput,
  type AjustadorListado,
} from '@cova/shared/schemas/ajustadores'
import type { AseguradoraListado } from '@cova/shared/schemas/aseguradoras'
import { Aviso } from '@/components/aviso'
import { SelectField } from '@/components/select-field'
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
import { plural } from '@/lib/texto'
import { crearAjustador, modificarAjustador } from '../api/ajustadores.api'

export type EdicionAjustador =
  { tipo: 'nuevo'; idAseguradora?: number } | { tipo: 'modificar'; ajustador: AjustadorListado }

const vacio: AjustadorInput = {
  nombres: '',
  apellidos: '',
  email: '',
  telefono: '',
  idAseguradora: '',
}

// CU-03 pasos 3 a 6 (alta) y 3.b (modificación), en un modal. Valida con el mismo esquema que el backend; el
// email repetido y la aseguradora que ya no está activa los detecta el servidor y se muestran en su campo.
export function AjustadorDialog({
  abierto,
  elementoAlCerrar,
  edicion,
  aseguradoras,
  onCerrar,
  onGuardado,
}: {
  /** Separado de "edicion": al cerrar, el contenido no cambia durante la animación de salida */
  abierto: boolean
  /** Dónde poner el foco al cerrar (el ⋮ de la fila); sin él, Radix lo devuelve a lo que estaba enfocado */
  elementoAlCerrar?: () => HTMLElement | null
  edicion: EdicionAjustador | null
  aseguradoras: AseguradoraListado[]
  onCerrar: () => void
  onGuardado: (mensaje: string) => void
}) {
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<AjustadorInput, unknown, AjustadorData>({
    resolver: zodResolver(ajustadorSchema),
    defaultValues: vacio,
  })

  useEffect(() => {
    if (!abierto || !edicion) return
    if (edicion.tipo === 'modificar') {
      const { nombres, apellidos, email, telefono, aseguradora } = edicion.ajustador
      reset({ nombres, apellidos, email, telefono, idAseguradora: String(aseguradora.id) })
    } else {
      reset({ ...vacio, idAseguradora: edicion.idAseguradora ? String(edicion.idAseguradora) : '' })
    }
  }, [abierto, edicion, reset])

  const ajustador = edicion?.tipo === 'modificar' ? edicion.ajustador : null
  // Con siniestros activos no se le cambia la aseguradora: quedarían con una aseguradora y un ajustador que
  // no coinciden (el backend también lo rechaza)
  const aseguradoraFija = ajustador !== null && ajustador.casosActivos > 0
  const opciones = aseguradoras
    .filter((a) => !a.eliminado)
    .map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))

  const guardar = handleSubmit(async (datos) => {
    if (!edicion) return
    try {
      if (edicion.tipo === 'nuevo') {
        const creado = await crearAjustador(datos)
        onGuardado(`Se creó el ajustador ${creado.nombres} ${creado.apellidos}.`)
      } else {
        const modificado = await modificarAjustador(edicion.ajustador.id, datos)
        onGuardado(`Se guardaron los cambios de ${modificado.nombres} ${modificado.apellidos}.`)
      }
    } catch (err) {
      const conflicto = campoConflictoAjustadorSchema.safeParse(
        err instanceof ApiError ? err.detalles : null,
      )
      if (err instanceof ApiError && err.status === 409 && conflicto.success) {
        setError(conflicto.data.campo, { message: err.message }, { shouldFocus: true })
      } else {
        setError('root', {
          message: err instanceof ApiError ? err.message : 'No se pudo guardar. Probá de nuevo.',
        })
      }
    }
  })

  const esNuevo = edicion?.tipo !== 'modificar'
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
          setFocus('nombres', { shouldSelect: !esNuevo })
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {ajustador
              ? `Modificar a ${ajustador.nombres} ${ajustador.apellidos}`
              : 'Nuevo ajustador'}
          </DialogTitle>
          <DialogDescription>
            {esNuevo
              ? 'Elegí la aseguradora para la que trabaja y completá sus datos.'
              : 'Cambiá los datos que necesites y confirmá.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void guardar(e)} noValidate className="grid gap-5">
          {errors.root?.message && (
            <Aviso tipo="error" enfocar>
              {errors.root.message}
            </Aviso>
          )}
          <div className="grid items-start gap-5 sm:grid-cols-2">
            <TextField
              label="Nombres"
              required
              autoComplete="off"
              error={errors.nombres?.message}
              {...register('nombres')}
            />
            <TextField
              label="Apellidos"
              required
              autoComplete="off"
              error={errors.apellidos?.message}
              {...register('apellidos')}
            />
            <TextField
              label="Email"
              type="email"
              required
              containerClassName="sm:col-span-2"
              autoComplete="off"
              spellCheck={false}
              placeholder="nombre@ejemplo.com"
              error={errors.email?.message}
              {...register('email')}
            />
            <TextField
              label="Teléfono"
              type="tel"
              inputMode="tel"
              required
              autoComplete="off"
              placeholder="Ej.: 11 4382-5510"
              error={errors.telefono?.message}
              {...register('telefono')}
            />
            <Controller
              control={control}
              name="idAseguradora"
              render={({ field }) => (
                <SelectField
                  label="Aseguradora"
                  required
                  placeholder="Elegir aseguradora…"
                  opciones={opciones}
                  disabled={aseguradoraFija}
                  hint={
                    aseguradoraFija
                      ? `Tiene ${plural(ajustador.casosActivos, 'siniestro activo', 'siniestros activos')}: para cambiarle la aseguradora, primero reasignalos a otro ajustador.`
                      : opciones.length === 0
                        ? 'No hay aseguradoras activas. Creá una desde Aseguradoras.'
                        : 'Solo aparecen las aseguradoras activas.'
                  }
                  error={errors.idAseguradora?.message}
                  name={field.name}
                  value={String(field.value)}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                />
              )}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={isSubmitting}>
              {isSubmitting ? 'Guardando…' : esNuevo ? 'Crear ajustador' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
