import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  solicitarRecuperacionSchema,
  type SolicitarRecuperacionData,
} from '@cova/shared/schemas/auth'
import { Aviso } from '@/components/aviso'
import { TextField } from '@/components/text-field'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { solicitarRecuperacion, type RecuperacionSolicitada } from '../api/auth.api'

export function SolicitarRecuperacionForm({
  email,
  onEnviado,
}: {
  email: string
  onEnviado: (email: string, respuesta: RecuperacionSolicitada) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SolicitarRecuperacionData>({
    resolver: zodResolver(solicitarRecuperacionSchema),
    defaultValues: { email },
  })
  const enviar = handleSubmit(async (datos) => {
    if (isSubmitting) return
    setError(null)
    try {
      onEnviado(datos.email, await solicitarRecuperacion(datos))
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo solicitar el código. Probá de nuevo.',
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
      <TextField
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="nombre@ejemplo.com"
        error={errors.email?.message}
        {...register('email')}
      />
      <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
        {isSubmitting ? 'Enviando…' : 'Enviar código'}
      </Button>
    </form>
  )
}
