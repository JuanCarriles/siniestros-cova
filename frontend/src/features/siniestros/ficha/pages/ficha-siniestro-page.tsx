import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import { usePanel } from '@/components/layout/panel-context'
import { Button } from '@/components/ui/button'
import { PartesDialog, type PedidoPartes } from '../../components/partes-dialog'
import { CabeceraFicha } from '../components/cabecera-ficha'
import { PestanasFicha } from '../components/pestanas-ficha'
import { useFicha } from '../hooks/use-ficha'

type EstadoFicha = { pasosAlListado: number }

// Ficha del siniestro (CU-10, E5-01): la cabecera y las pestañas quedan fijas; cada pestaña se abre en el <Outlet>
// con su propia dirección. El acceso lo controla el servidor (E4-03, 1.j).
export function FichaSiniestroPage() {
  const ficha = useFicha()
  const panel = usePanel()
  const navigate = useNavigate()
  const location = useLocation()
  const [partes, setPartes] = useState<PedidoPartes | null>(null)
  // Cuántos pasos atrás quedó el listado: 1 al llegar navegando, uno más por cada pestaña abierta, 0 si se entró
  // directo a la dirección (no hay listado detrás)
  const pasosAlListado =
    (location.state as EstadoFicha | null)?.pasosAlListado ?? (location.key !== 'default' ? 1 : 0)

  return (
    <>
      <Button asChild variant="link" className="mb-3 px-0">
        <Link
          to={`${panel.basePath}/siniestros`}
          onClick={(e) => {
            // Vuelve al listado con sus filtros y su página, aunque se hayan abierto varias pestañas
            if (pasosAlListado > 0) {
              e.preventDefault()
              void navigate(-pasosAlListado)
            }
          }}
        >
          <ChevronLeft aria-hidden="true" /> Volver al listado
        </Link>
      </Button>

      <CabeceraFicha
        ficha={ficha}
        onVerAjustador={() =>
          setPartes({
            siniestro: { id: ficha.id, numeroSiniestro: ficha.numeroSiniestro },
            vista: { tipo: 'ajustador' },
          })
        }
      />
      <PestanasFicha
        ficha={ficha}
        esGestor={panel.usuario.tipo === 'GESTOR'}
        estado={{ pasosAlListado: pasosAlListado && pasosAlListado + 1 } satisfies EstadoFicha}
      />
      {/* Las pestañas siguen usando usePanel: se les pasa el mismo contexto del panel */}
      <Outlet context={panel} />

      <PartesDialog pedido={partes} onCerrar={() => setPartes(null)} />
    </>
  )
}
