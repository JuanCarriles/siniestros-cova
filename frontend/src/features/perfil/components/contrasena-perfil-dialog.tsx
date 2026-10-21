import { useId } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { nuevaContrasenaSchema, type NuevaContrasenaData } from '@cova/shared/schemas/auth'
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
  contrasenaActual,
  elementoAlCerrar,
}: {
  onCerrar: () => void
  onGuardado: () => void
  contrasenaActual: string
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
  } = useForm<NuevaContrasenaData>({
    resolver: zodResolver(nuevaContrasenaSchema),
    defaultValues: { contrasena: '', confirmarContrasena: '' },
  })
  const contrasena = useWatch({ control, name: 'contrasena' })
  const guardar = handleSubmit(async (datos) => {
    try {
      await cambiarContrasenaPerfil({ ...datos, contrasenaActual })
      reset()
      onGuardado()
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
          setFocus('contrasena')
        }}
      >
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>
            Escribí la nueva contraseña dos veces. Se cerrarán tus otras sesiones.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(e) => void guardar(e)} className="grid gap-4">
          {errors.root?.message && (
            <Aviso tipo="error" enfocar>
              {errors.root.message}
            </Aviso>
          )}
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
              Guardar contraseña
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
