import { useId } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  perfilContrasenaSchema,
  type PerfilContrasenaData,
  type PerfilContrasenaRespuesta,
} from '@cova/shared/schemas/perfil'
import { ReglasContrasena } from '@/components/reglas-contrasena'
import { PasswordField } from '@/components/password-field'
import { Aviso } from '@/components/aviso'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { ApiError } from '@/lib/api'
import { cambiarContrasenaPerfil } from '../api/perfil.api'

export function ContrasenaPerfilDialog({
  onCerrar,
  onGuardado,
  elementoAlCerrar,
}: {
  onCerrar: () => void
  onGuardado: (resultado: PerfilContrasenaRespuesta) => void
  elementoAlCerrar: () => HTMLElement | null
}) {
  const reglasId = useId()
  const {
    register,
    control,
    handleSubmit,
    setFocus,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PerfilContrasenaData>({
    resolver: zodResolver(perfilContrasenaSchema),
    defaultValues: { contrasenaActual: '', contrasena: '', confirmarContrasena: '' },
  })
  const contrasena = useWatch({ control, name: 'contrasena' })
  const guardar = handleSubmit(async (datos) => {
    try {
      const resultado = await cambiarContrasenaPerfil(datos)
      reset()
      onGuardado(resultado)
    } catch (err) {
      setError('root', {
        message: err instanceof ApiError ? err.message : 'No se pudo cambiar. Probá de nuevo.',
      })
    }
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
        onCloseAutoFocus={(event) => {
          const elemento = elementoAlCerrar()
          if (elemento) {
            event.preventDefault()
            elemento.focus()
          }
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          setFocus('contrasenaActual')
        }}
      >
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>
            Ingresá tu contraseña actual y la nueva dos veces. Al guardar se cerrarán todas tus
            sesiones, incluida esta, y te enviaremos un aviso por correo.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(e) => void guardar(e)} className="grid gap-4">
          {errors.root?.message && (
            <Aviso tipo="error" enfocar>
              {errors.root.message}
            </Aviso>
          )}
          <PasswordField
            label="Contraseña actual"
            required
            entradaManual
            autoComplete="off"
            maxLength={128}
            error={errors.contrasenaActual?.message}
            {...register('contrasenaActual')}
          />
          <PasswordField
            id="perfil-nueva-contrasena"
            label="Nueva contraseña"
            required
            autoComplete="new-password"
            maxLength={128}
            aria-describedby={reglasId}
            error={errors.contrasena?.message}
            {...register('contrasena')}
          />
          <ReglasContrasena id={reglasId} valor={contrasena} />
          <PasswordField
            label="Repetir nueva contraseña"
            required
            autoComplete="new-password"
            maxLength={128}
            error={errors.confirmarContrasena?.message}
            {...register('confirmarContrasena')}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={isSubmitting}>
              Cambiar contraseña y salir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
