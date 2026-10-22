import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AuthLayout } from '../components/auth-layout'
import { RecuperacionHeader } from '../components/recuperacion-header'
import { Aviso } from '@/components/aviso'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { solicitarRecuperacion, type RecuperacionSolicitada } from '../api/auth.api'
import { SolicitarRecuperacionForm } from '../components/solicitar-recuperacion-form'
import { VerificarCodigoForm } from '../components/verificar-codigo-form'
import { NuevaContrasenaForm } from '../components/nueva-contrasena-form'

const titulos = {
  1: 'Recuperar contraseña',
  2: 'Ingresá el código',
  3: 'Creá una contraseña nueva',
}
function ocultarEmail(email: string) {
  const [nombre, dominio] = email.split('@')
  return `${nombre?.slice(0, 1)}•••@${dominio ?? ''}`
}

export function RecuperarContrasenaPage() {
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const [email, setEmail] = useState('')
  const [respuesta, setRespuesta] = useState<RecuperacionSolicitada | null>(null)
  const [reenvioHasta, setReenvioHasta] = useState(0)
  const [restante, setRestante] = useState(0)
  const [reenviando, setReenviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardada, setGuardada] = useState(false)
  const titulo = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (paso > 1 || guardada) titulo.current?.focus()
  }, [paso, guardada])
  useEffect(() => {
    if (!reenvioHasta) return
    const timer = window.setInterval(
      () => setRestante(Math.max(0, Math.ceil((reenvioHasta - Date.now()) / 1000))),
      500,
    )
    return () => window.clearInterval(timer)
  }, [reenvioHasta])
  function solicitado(destino: string, datos: RecuperacionSolicitada) {
    setEmail(destino)
    setRespuesta(datos)
    setPaso(2)
    setError(null)
    setRestante(datos.reenvioSegundos)
    setReenvioHasta(Date.now() + datos.reenvioSegundos * 1000)
  }
  async function reenviar() {
    if (reenviando || restante > 0) return
    setReenviando(true)
    setError(null)
    try {
      solicitado(email, await solicitarRecuperacion({ email }))
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo reenviar el código. Probá de nuevo.',
      )
    } finally {
      setReenviando(false)
    }
  }
  return (
    <AuthLayout titulo={guardada ? 'Contraseña actualizada' : titulos[paso]}>
      <RecuperacionHeader
        paso={paso}
        volver={
          paso === 2
            ? () => {
                setPaso(1)
                setError(null)
              }
            : undefined
        }
      />
      <h1
        ref={titulo}
        tabIndex={-1}
        className="text-2xl font-bold text-foreground focus:outline-none"
      >
        {guardada ? 'Contraseña actualizada' : titulos[paso]}
      </h1>
      {guardada ? (
        <div className="mt-5 grid gap-6">
          <Aviso tipo="exito">
            Tu contraseña se guardó y se cerraron las sesiones anteriores. Ingresá con tu nueva
            contraseña.
          </Aviso>
          <Button asChild size="lg" className="w-full">
            <Link to="/login?motivo=contrasena-actualizada">Volver a ingresar</Link>
          </Button>
        </div>
      ) : (
        <>
          <p role={paso === 2 ? 'status' : undefined} className="mt-3 text-muted-foreground">
            {paso === 1 &&
              'Ingresá el email de tu cuenta para solicitar un código y crear una contraseña nueva.'}
            {paso === 2 && (
              <>
                Si la cuenta está registrada y activa, recibirás un código de 6 dígitos en{' '}
                <strong className="whitespace-nowrap">{ocultarEmail(email)}</strong>. Vence en{' '}
                {Math.ceil((respuesta?.vigenciaSegundos ?? 300) / 60)} minutos.
              </>
            )}
            {paso === 3 &&
              'Elegí una contraseña nueva. Al guardarla se cerrarán las sesiones anteriores de tu cuenta.'}
          </p>
          {error && (
            <Aviso tipo="error" enfocar className="mt-5">
              {error}
            </Aviso>
          )}
          {paso === 1 && <SolicitarRecuperacionForm email={email} onEnviado={solicitado} />}
          {paso === 2 && (
            <VerificarCodigoForm
              onVerificado={() => setPaso(3)}
              onReenviar={() => void reenviar()}
              espera={restante}
              reenviando={reenviando}
            />
          )}
          {paso === 3 && <NuevaContrasenaForm onGuardada={() => setGuardada(true)} />}
        </>
      )}
    </AuthLayout>
  )
}
