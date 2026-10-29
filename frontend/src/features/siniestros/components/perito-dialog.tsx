import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { TipoPerito } from '@cova/shared/schemas/enums'
import {
  TIPOS_PERITO,
  hoyArgentina,
  peritoAltaSchema,
  type PeritoAltaData,
  type PeritoAltaInput,
} from '@cova/shared/schemas/siniestros-alta'
import { TextField } from '@/components/text-field'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { PeritoBorrador } from '../borrador-alta'

type PeritoFormulario = Omit<PeritoAltaInput, 'tipoPerito'> & { tipoPerito: TipoPerito }

const aFormulario = (tipo: TipoPerito, p: PeritoBorrador | null): PeritoFormulario => ({
  tipoPerito: tipo,
  nombre: p?.nombre ?? '',
  telefono: p?.telefono ?? '',
  email: p?.email ?? '',
  // Nuevo: la solicitud suele ser de hoy; se puede cambiar
  fechaSolicitud: p?.fechaSolicitud ?? hoyArgentina(),
  fechaCierre: p?.fechaCierre ?? '',
})

// CU-09 pasos 28-30 (E4-09). El tipo lo da el lugar desde el que se abre (uno de cada tipo como máximo). Nombre y
// fecha de solicitud son obligatorios; sin fecha de cierre la pericia queda pendiente (29.a).
export function PeritoDialog({
  tipo,
  perito,
  onGuardar,
  onCerrar,
  elementoAlCerrar,
}: {
  tipo: TipoPerito
  /** null: cargar uno nuevo */
  perito: PeritoBorrador | null
  onGuardar: (datos: PeritoAltaData) => void
  onCerrar: () => void
  elementoAlCerrar: () => HTMLElement | null
}) {
  const nuevo = perito === null
  const nombreTipo = tipo === 'MEDICO' ? 'perito médico' : `perito ${TIPOS_PERITO[tipo]}`
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PeritoFormulario, unknown, PeritoAltaData>({
    resolver: zodResolver(peritoAltaSchema),
    defaultValues: aFormulario(tipo, perito),
  })
  const solicitud = useWatch({ control, name: 'fechaSolicitud' })
  const hoy = hoyArgentina()

  const guardar = handleSubmit((datos) => {
    onGuardar(datos)
    onCerrar()
  })

  return (
    <Dialog open onOpenChange={(abrir) => !abrir && onCerrar()}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          const elemento = elementoAlCerrar()
          if (elemento) {
            e.preventDefault()
            elemento.focus()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {nuevo ? 'Cargar' : 'Modificar'} {nombreTipo}
          </DialogTitle>
          <DialogDescription>
            El nombre y la fecha de solicitud son obligatorios. Si la pericia sigue en curso, dejá
            vacía la fecha de cierre: queda pendiente.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(e) => void guardar(e)} className="grid gap-5">
          <TextField
            label="Nombre completo"
            required
            autoFocus
            autoComplete="off"
            maxLength={150}
            error={errors.nombre?.message}
            {...register('nombre')}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Teléfono"
              type="tel"
              autoComplete="off"
              maxLength={50}
              error={errors.telefono?.message}
              {...register('telefono')}
            />
            <TextField
              label="Email"
              type="email"
              autoComplete="off"
              maxLength={120}
              placeholder="nombre@ejemplo.com"
              error={errors.email?.message}
              {...register('email')}
            />
            <TextField
              label="Fecha de solicitud"
              type="date"
              required
              max={hoy}
              error={errors.fechaSolicitud?.message}
              {...register('fechaSolicitud')}
            />
            <TextField
              label="Fecha de cierre"
              type="date"
              min={solicitud || undefined}
              max={hoy}
              hint="Vacía: la pericia queda pendiente."
              error={errors.fechaCierre?.message}
              {...register('fechaCierre')}
            />
          </div>
          <DialogFooter className="gap-3">
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit">{nuevo ? `Guardar ${nombreTipo}` : 'Guardar cambios'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
