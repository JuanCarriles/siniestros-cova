import { isRouteErrorResponse, Link, useRouteError, useRouteLoaderData } from 'react-router'
import { ArrowRight, CircleAlert, LockKeyhole } from 'lucide-react'
import type { SesionUsuario } from '@cova/shared/schemas/auth'
import { Button } from '@/components/ui/button'
import { MENSAJE_SIN_CONEXION } from '@/lib/api'
import { initialSection } from './panel-navigation'

// Dentro del panel: dirección que no existe o sección que el rol no puede abrir (403 de requerirSeccion), y
// cualquier otro error al cargar una sección. El menú sigue visible para salir de acá.
export function SeccionNoDisponible() {
  const error = useRouteError()
  const panel = useRouteLoaderData<{ usuario: SesionUsuario }>('panel')
  const inicio = panel && initialSection(panel.usuario.tipoUsuario)
  const noDisponible = !error || (isRouteErrorResponse(error) && [403, 404].includes(error.status))
  // Un loader puede explicar el motivo (p. ej. "Este siniestro no está asignado a vos")
  const motivo =
    isRouteErrorResponse(error) && typeof error.data === 'string' && error.data ? error.data : null
  const sinPermiso = isRouteErrorResponse(error) && error.status === 403

  return (
    <section className="max-w-2xl rounded-xl border bg-card p-6 shadow-card sm:p-10">
      {noDisponible ? (
        <>
          <LockKeyhole className="mb-5 size-10 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-primary">
            {motivo && sinPermiso
              ? 'No tenés permiso para ver esto'
              : motivo
                ? 'No encontramos lo que buscabas'
                : 'Esta sección no está disponible'}
          </h1>
          <p className="mt-3 mb-6 text-muted-foreground">
            {motivo ?? 'La dirección no existe o no está habilitada para tu rol.'}
          </p>
        </>
      ) : (
        <>
          <CircleAlert className="mb-5 size-10 text-destructive" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-primary">No se pudo cargar esta sección</h1>
          <p className="mt-3 mb-6 text-muted-foreground">{MENSAJE_SIN_CONEXION}</p>
        </>
      )}
      {inicio && (
        <Button asChild>
          <Link to={`/${inicio}`}>
            Volver a mi espacio
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      )}
    </section>
  )
}
