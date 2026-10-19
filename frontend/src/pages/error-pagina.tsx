import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { CircleAlert, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError, MENSAJE_SIN_CONEXION } from '@/lib/api'

// Página completa para lo que no se puede mostrar dentro del panel: una dirección inexistente fuera de él o el
// servidor sin responder al verificar la sesión.
export function ErrorPagina() {
  const error = useRouteError()
  const noEncontrada = !error || (isRouteErrorResponse(error) && error.status === 404)
  const Icono = noEncontrada ? SearchX : CircleAlert

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8">
      <title>{noEncontrada ? 'Página no encontrada · Estudio Cova' : 'Error · Estudio Cova'}</title>
      <section className="w-full max-w-[32rem] rounded-xl border bg-surface p-6 shadow-card sm:p-8">
        <Icono
          className={noEncontrada ? 'mb-5 size-10 text-primary' : 'mb-5 size-10 text-destructive'}
          aria-hidden="true"
        />
        <h1 className="text-2xl font-bold text-foreground">
          {noEncontrada ? 'No encontramos esta página' : 'No se pudo abrir el sistema'}
        </h1>
        <p className="mt-3 mb-6 text-muted-foreground">
          {noEncontrada
            ? 'Revisá la dirección o volvé al inicio.'
            : error instanceof ApiError
              ? error.message
              : MENSAJE_SIN_CONEXION}
        </p>
        {noEncontrada ? (
          <Button asChild>
            <Link to="/">Ir al inicio</Link>
          </Button>
        ) : (
          <Button onClick={() => window.location.reload()}>Probar de nuevo</Button>
        )}
      </section>
    </main>
  )
}
