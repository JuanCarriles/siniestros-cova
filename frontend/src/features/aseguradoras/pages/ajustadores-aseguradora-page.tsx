import { useState } from 'react'
import { Link, useLoaderData } from 'react-router'
import { ChevronLeft, UsersRound } from 'lucide-react'
import type { AjustadorVinculado } from '@cova/shared/schemas/aseguradoras'
import { BarraAbm } from '@/components/abm/barra-abm'
import { EstadoRegistro } from '@/components/abm/estado-registro'
import { ListadoAbm } from '@/components/abm/listado-abm'
import { TablaAbm, type ColumnaAbm } from '@/components/abm/tabla-abm'
import { SectionHeading } from '@/components/layout/section-heading'
import { Button } from '@/components/ui/button'
import { normalizarBusqueda, plural } from '@/lib/texto'
import type { cargarAjustadoresAseguradora } from '../loader'

const nombre = (ajustador: AjustadorVinculado) => `${ajustador.nombres} ${ajustador.apellidos}`
const columnas: ColumnaAbm<AjustadorVinculado>[] = [
  { id: 'nombre', encabezado: 'Ajustador', principal: true, celda: nombre },
  { id: 'email', encabezado: 'Email', celda: (a) => a.email },
  { id: 'telefono', encabezado: 'Teléfono', celda: (a) => a.telefono },
  {
    id: 'estado',
    encabezado: 'Estado',
    celda: () => <EstadoRegistro eliminado={false} genero="masculino" />,
  },
]

// Consulta acotada a los ajustadores que impiden dar de baja esta aseguradora.
export function AjustadoresAseguradoraPage() {
  const { aseguradora, ajustadores } = useLoaderData<typeof cargarAjustadoresAseguradora>()
  const [busqueda, setBusqueda] = useState('')
  const buscado = normalizarBusqueda(busqueda)
  const visibles = ajustadores.filter((a) =>
    normalizarBusqueda(`${nombre(a)} ${a.email}`).includes(buscado),
  )
  return (
    <>
      <Button asChild variant="link" className="mb-3 px-0">
        <Link to="/aseguradoras">
          <ChevronLeft aria-hidden="true" /> Volver a aseguradoras
        </Link>
      </Button>
      <SectionHeading
        section="ajustadores"
        titulo={`Ajustadores de ${aseguradora.nombre}`}
        descripcion={
          ajustadores.length > 0
            ? 'Los ajustadores activos de esta aseguradora. Mientras tenga alguno, no se la puede dar de baja.'
            : 'Ya no tiene ajustadores activos: se la puede dar de baja.'
        }
      />
      <BarraAbm
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholderBusqueda="Buscar por nombre o email"
      />
      <ListadoAbm
        titulo={plural(visibles.length, 'ajustador', 'ajustadores')}
        resumen={[aseguradora.nombre]}
        nota="Se muestran únicamente los ajustadores activos de esta aseguradora. Los dados de baja no bloquean su baja."
      >
        <TablaAbm
          filas={visibles}
          columnas={columnas}
          clave={(a) => a.id}
          nombre={nombre}
          etiqueta={`Ajustadores activos de ${aseguradora.nombre}`}
          vacio={
            <div className="grid justify-items-center gap-2">
              <UsersRound className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-semibold">
                {buscado
                  ? 'No hay ajustadores que coincidan con la búsqueda.'
                  : 'Esta aseguradora no tiene ajustadores activos.'}
              </p>
              <p className="text-muted-foreground">
                {buscado
                  ? 'Probá con otro nombre o email.'
                  : 'Podés volver al listado de aseguradoras para continuar.'}
              </p>
            </div>
          }
        />
      </ListadoAbm>
    </>
  )
}
