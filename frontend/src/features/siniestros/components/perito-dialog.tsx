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
import { Aviso } from '@/components/aviso'
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
import { campoDelError, mensajeDelError } from '../errores-servidor'

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
// fecha de solicitud son obligatorios; sin fecha de cierre la pericia queda pendiente (29.a). La ficha (CU-10 1.e,
// E5-07) usa el mismo formulario: ahí guardar espera al servidor y, si rechaza, el modal sigue abierto.
export function PeritoDialog({
  tipo,
  perito,
  registrarCierre = false,
  onGuardar,
  onCerrar,
  elementoAlCerrar,
}: {
  tipo: TipoPerito
  /** null: cargar uno nuevo */
  perito: PeritoBorrador | null
  /** Desde la ficha, para una pericia pendiente: el foco va a la fecha de cierre, propuesta con la de hoy */
  registrarCierre?: boolean
  onGuardar: (datos: PeritoAltaData) => void | Promise<void>
  onCerrar: () => void
  elementoAlCerrar: () => HTMLElement | null
}) {
  const nuevo = perito === null
  const nombreTipo = tipo === 'MEDICO' ? 'perito médico' : `perito ${TIPOS_PERITO[tipo]}`
  const pericia = tipo === 'MEDICO' ? 'pericia médica' : `pericia ${TIPOS_PERITO[tipo]}`
  const hoy = hoyArgentina()
  const valores = aFormulario(tipo, perito)
  if (registrarCierre && !valores.fechaCierre) valores.fechaCierre = hoy
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PeritoFormulario, unknown, PeritoAltaData>({
    resolver: zodResolver(peritoAltaSchema),
    defaultValues: valores,
  })
  const solicitud = useWatch({ control, name: 'fechaSolicitud' })

  const guardar = handleSubmit(async (datos) => {
    if (registrarCierre && !datos.fechaCierre) {
      setError('fechaCierre', { message: 'Ingresá la fecha de cierre' }, { shouldFocus: true })
      return
    }
    try {
      await onGuardar(datos)
    } catch (err) {
      const campo = campoDelError(err, ['nombre', 'fechaSolicitud', 'fechaCierre'] as const)
      if (campo) setError(campo, { message: mensajeDelError(err, '') }, { shouldFocus: true })
      else
        setError('root', {
          message: mensajeDelError(err, 'No se pudo guardar. Revisá la conexión y probá de nuevo.'),
        })
      return
    }
    onCerrar()
  })

  return (
    <Dialog
      open
      onOpenChange={(abrir) => {
        if (!abrir && !isSubmitting) onCerrar()
      }}
    >
      <DialogContent
        showCloseButton={!isSubmitting}
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
            {registrarCierre
              ? `Registrar el cierre de la ${pericia}`
              : `${nuevo ? 'Cargar' : 'Modificar'} ${nombreTipo}`}
          </DialogTitle>
          <DialogDescription>
            {registrarCierre
              ? 'Revisá la fecha de cierre (propuesta: hoy) y guardá. Registrar el cierre cuenta como movimiento del caso.'
              : 'El nombre y la fecha de solicitud son obligatorios. Si la pericia sigue en curso, dejá vacía la fecha de cierre: queda pendiente.'}
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(e) => void guardar(e)} className="grid gap-5">
          <TextField
            label="Nombre completo"
            required
            autoFocus={!registrarCierre}
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
              autoFocus={registrarCierre}
              required={registrarCierre}
              min={solicitud || undefined}
              max={hoy}
              hint={registrarCierre ? undefined : 'Vacía: la pericia queda pendiente.'}
              error={errors.fechaCierre?.message}
              {...register('fechaCierre')}
            />
          </div>
          {errors.root && (
            <Aviso tipo="error" enfocar>
              {errors.root.message}
            </Aviso>
          )}
          <DialogFooter className="gap-3">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {registrarCierre
                ? 'Registrar cierre'
                : nuevo
                  ? `Guardar ${nombreTipo}`
                  : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
