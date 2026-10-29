import { Link, useNavigate, useSearchParams } from 'react-router'
import { Aviso } from '@/components/aviso'
import { AuthLayout } from '../components/auth-layout'
import { LoginForm } from '../components/login-form'
import { rutaInicio, rutaVolverSegura } from '../sesion'

// Por qué se llegó al login, cuando no fue por elección propia
const motivos: Record<string, string> = {
  'contrasena-actualizada':
    'Tu contraseña se actualizó y se cerraron todas tus sesiones. Ingresá con la nueva contraseña.',
  'sesion-vencida':
    'Tu sesión se cerró después de 7 horas sin actividad. Volvé a ingresar para seguir.',
  salida: 'Cerraste la sesión.',
}

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const motivo = motivos[params.get('motivo') ?? '']
  const volver = rutaVolverSegura(params.get('volver'))

  return (
    <AuthLayout titulo="Ingresar">
      <h1 className="text-2xl font-bold text-foreground">Ingresar al sistema</h1>
      <p className="mt-2 mb-6 text-muted-foreground">
        Usá el email y la contraseña que te dio el administrador del estudio.
      </p>
      {motivo && (
        <Aviso tipo="info" className="mb-5">
          {motivo}
        </Aviso>
      )}
      {params.get('motivo') === 'contrasena-actualizada' &&
        params.get('aviso') === 'correo-no-enviado' && (
          <Aviso tipo="info" className="mb-5">
            No se pudo enviar el aviso por correo. Tu contraseña ya cambió y tus sesiones se
            cerraron.
          </Aviso>
        )}
      <LoginForm
        onIngreso={(usuario) =>
          void navigate(volver ?? rutaInicio(usuario.tipoUsuario), { replace: true })
        }
      />
      <p className="mt-6 text-center">
        <Link
          to="/recuperar-contrasena"
          className="inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4 hover:decoration-2"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </AuthLayout>
  )
}
