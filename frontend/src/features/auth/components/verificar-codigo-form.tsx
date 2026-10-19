import { useState } from 'react'
import { verificarCodigoSchema } from '@cova/shared/schemas/auth'
import { Aviso } from '@/components/aviso'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { verificarCodigo } from '../api/auth.api'
import { CodigoField } from './codigo-field'

export function VerificarCodigoForm({
  onVerificado,
  onReenviar,
  espera,
  reenviando,
}: {
  onVerificado: () => void
  onReenviar: () => void
  espera: number
  reenviando: boolean
}) {
  const [codigo, setCodigo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCodigo, setErrorCodigo] = useState<string | undefined>()
  return (
    <form
      noValidate
      className="mt-6 grid gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (enviando || reenviando) return
        const datos = verificarCodigoSchema.safeParse({ codigo })
        setErrorCodigo(datos.success ? undefined : datos.error.issues[0]?.message)
        if (!datos.success) return
        setEnviando(true)
        setError(null)
        void verificarCodigo(datos.data)
          .then(onVerificado)
          .catch((err: unknown) => {
            setError(
              err instanceof ApiError
                ? err.message
                : 'No se pudo verificar el código. Probá de nuevo.',
            )
          })
          .finally(() => setEnviando(false))
      }}
    >
      {error && <Aviso tipo="error">{error}</Aviso>}
      <CodigoField
        value={codigo}
        onChange={setCodigo}
        error={errorCodigo}
        disabled={enviando || reenviando}
      />
      <Button type="submit" size="lg" loading={enviando} disabled={reenviando} className="w-full">
        {enviando ? 'Verificando…' : 'Verificar código'}
      </Button>
      <div className="text-center text-sm text-muted-foreground">
        <p>¿No te llegó? Revisá también la carpeta de spam.</p>
        <Button
          variant="link"
          onClick={onReenviar}
          disabled={espera > 0 || enviando}
          loading={reenviando}
          className="mt-2 w-full"
        >
          {reenviando
            ? 'Reenviando…'
            : espera > 0
              ? `Reenviar código en ${espera} s`
              : 'Reenviar código'}
        </Button>
      </div>
    </form>
  )
}
