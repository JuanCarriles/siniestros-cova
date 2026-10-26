import { Link } from 'react-router'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { Aviso } from '@/components/aviso'
import { usePanel } from '@/components/layout/panel-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { ConsultaSiniestrosActivosBaja } from './use-siniestros-activos-baja'

export function SiniestrosActivosBaja({
  consulta,
  nombre,
  onAbrir,
}: {
  consulta: ConsultaSiniestrosActivosBaja
  nombre: string
  onAbrir: () => void
}) {
  const { basePath } = usePanel()
  const { datos, cargando, error } = consulta
  if (cargando)
    return (
      <p role="status" className="text-muted-foreground">
        Consultando siniestros activos…
      </p>
    )
  if (error)
    return (
      <div className="grid gap-3">
        <Aviso tipo="error">{error} No se habilitará la baja hasta comprobar los casos.</Aviso>
        <Button variant="outline" onClick={consulta.actualizar}>
          Reintentar consulta
        </Button>
      </div>
    )
  if (!datos) return null
  const { casosActivos, siniestros, pagina, porPagina } = datos
  return (
    <section aria-label="Siniestros activos asociados" className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-primary">Siniestros activos asociados</h3>
        <Button variant="outline" onClick={consulta.actualizar}>
          <RefreshCw aria-hidden="true" />
          Actualizar casos
        </Button>
      </div>
      {casosActivos === 0 ? (
        <Aviso tipo="info">
          No quedan siniestros activos asociados. Ya podés confirmar la baja.
        </Aviso>
      ) : (
        <>
          <p role="status">
            Para dar de baja a <strong>{nombre}</strong>, primero cerrá o reasigná estos siniestros.
            Después tocá <strong>Actualizar casos</strong>.
          </p>
          {siniestros.length ? (
            <ul className="grid gap-3 rounded-lg border p-3">
              {siniestros.map((caso) => (
                <li
                  key={caso.id}
                  className="grid min-w-0 gap-3 rounded-lg bg-muted p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold break-words">Siniestro {caso.numeroSiniestro}</p>
                    <p className="break-words text-muted-foreground">{caso.aseguradora}</p>
                    <Badge variant="info">{caso.estado}</Badge>
                  </div>
                  <Button asChild variant="outline">
                    <Link to={`${basePath}/siniestros/${caso.id}`} onClick={onAbrir}>
                      Ver siniestro <ArrowRight aria-hidden="true" />
                      <span className="sr-only"> {caso.numeroSiniestro}</span>
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p>Los casos cambiaron mientras consultabas. Usá «Actualizar casos» para verlos.</p>
          )}
          {(casosActivos > porPagina || pagina > 1) && (
            <nav
              aria-label="Páginas de siniestros asociados"
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <Button variant="outline" disabled={pagina === 1} onClick={consulta.anterior}>
                Anterior
              </Button>
              <span className="text-muted-foreground">
                Página {pagina} de {Math.max(1, Math.ceil(casosActivos / porPagina))}
              </span>
              <Button
                variant="outline"
                disabled={pagina * porPagina >= casosActivos}
                onClick={consulta.siguiente}
              >
                Siguiente
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  )
}
