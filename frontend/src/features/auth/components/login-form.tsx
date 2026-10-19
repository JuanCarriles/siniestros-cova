import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginData, type LoginInput } from '@cova/shared/schemas/auth'
import type { SesionUsuario } from '@cova/shared/schemas/auth'
import { Aviso } from '@/components/aviso'
import { PasswordField } from '@/components/password-field'
import { TextField } from '@/components/text-field'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { iniciarSesion } from '../api/auth.api'

// CU-01. Valida con el mismo esquema Zod que el backend. Los errores de cada campo van debajo del campo; los
// del servidor (credenciales, demasiados intentos, sin conexión) en un aviso arriba que recibe el foco.
export function LoginForm({ onIngreso }: { onIngreso: (usuario: SesionUsuario) => void }) {
  const [errorServidor, setErrorServidor] = useState<string | null>(null)
  const aviso = useRef<HTMLDivElement>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput, unknown, LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', contrasena: '' },
  })

  useEffect(() => {
    if (errorServidor) aviso.current?.focus()
  }, [errorServidor])

  const enviar = handleSubmit(async (datos) => {
    setErrorServidor(null)
    try {
      onIngreso(await iniciarSesion(datos))
    } catch (err) {
      setErrorServidor(
        err instanceof ApiError
          ? err.message
          : 'No se pudo ingresar. Probá de nuevo en unos minutos.',
      )
    }
  })

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="grid gap-5">
      {errorServidor && (
        <Aviso ref={aviso} tipo="error">
          {errorServidor}
        </Aviso>
      )}
      <TextField
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="nombre@ejemplo.com"
        error={errors.email?.message}
        {...register('email')}
      />
      <PasswordField
        label="Contraseña"
        autoComplete="current-password"
        error={errors.contrasena?.message}
        {...register('contrasena')}
      />
      <Button type="submit" size="lg" loading={isSubmitting} className="mt-1 w-full">
        {isSubmitting ? 'Ingresando…' : 'Ingresar'}
      </Button>
    </form>
  )
}
