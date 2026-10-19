import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { nuevaContrasenaSchema, type NuevaContrasenaData } from '@cova/shared/schemas/auth'
import { Aviso } from '@/components/aviso'
import { PasswordField } from '@/components/password-field'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { cambiarContrasenaRecuperada } from '../api/auth.api'

export function NuevaContrasenaForm({ onGuardada }: { onGuardada: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NuevaContrasenaData>({
    resolver: zodResolver(nuevaContrasenaSchema),
    defaultValues: { contrasena: '', confirmarContrasena: '' },
  })
  const enviar = handleSubmit(async (datos) => {
    if (isSubmitting) return
    setError(null)
    try {
      await cambiarContrasenaRecuperada(datos)
      onGuardada()
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña. Probá de nuevo.',
      )
    }
  })
  return (
    <form
      onSubmit={(e) => void enviar(e)}
      noValidate
      className="mt-6 grid gap-5"
      aria-busy={isSubmitting}
    >
      {error && <Aviso tipo="error">{error}</Aviso>}
      <PasswordField
        label="Nueva contraseña"
        autoComplete="new-password"
        hint="Usá entre 8 y 128 caracteres. Podés usar una frase larga."
        error={errors.contrasena?.message}
        {...register('contrasena')}
      />
      <PasswordField
        label="Confirmar contraseña"
        autoComplete="new-password"
        error={errors.confirmarContrasena?.message}
        {...register('confirmarContrasena')}
      />
      <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
        {isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
      </Button>
    </form>
  )
}
