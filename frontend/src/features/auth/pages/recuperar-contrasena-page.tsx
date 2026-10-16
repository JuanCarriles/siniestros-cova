import { Link } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import { AuthLayout } from '../components/auth-layout'

// Provisoria: la recuperación por código (CU-01 3.a) es otra historia de usuario. Mientras tanto, lo que
// corresponde hacer es pedirle una contraseña nueva a un administrador.
export function RecuperarContrasenaPage() {
  return (
    <AuthLayout titulo="Recuperar contraseña">
      <Link
        to="/login"
        className="mb-4 inline-flex min-h-12 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
        Volver a ingresar
      </Link>
      <h1 className="text-2xl font-bold text-foreground">Recuperar contraseña</h1>
      <p className="mt-3">
        Por ahora la contraseña no se puede recuperar desde acá. Pedile a un administrador del
        estudio que te genere una nueva.
      </p>
    </AuthLayout>
  )
}
