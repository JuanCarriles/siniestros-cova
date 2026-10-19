import { useRef, useState } from 'react'
import { useLoaderData, useRevalidator, useSearchParams } from 'react-router'
import { CircleMinus, Pencil, RotateCcw, SearchX } from 'lucide-react'
import type { AseguradoraListado } from '@cova/shared/schemas/aseguradoras'
import { BarraAbm } from '@/components/abm/barra-abm'
import { EstadoRegistro } from '@/components/abm/estado-registro'
import { ListadoAbm } from '@/components/abm/listado-abm'
import type { AccionFila } from '@/components/abm/menu-acciones'
import { TablaAbm, type ColumnaAbm } from '@/components/abm/tabla-abm'
import { Aviso } from '@/components/aviso'
import { SectionHeading } from '@/components/layout/section-heading'
import { normalizarBusqueda, plural } from '@/lib/texto'
import type { cargarAseguradoras } from '../loader'
import { AseguradoraDialog, type EdicionAseguradora } from '../components/aseguradora-dialog'
import { EstadoAseguradoraDialog, type CambioEstado } from '../components/estado-aseguradora-dialog'

// CU-02 paso 2: nombre, cantidad de ajustadores y estado
const columnas: ColumnaAbm<AseguradoraListado>[] = [
  { id: 'nombre', encabezado: 'Aseguradora', principal: true, celda: (a) => a.nombre },
  {
    id: 'ajustadores',
    encabezado: 'Ajustadores',
    encabezadoLector: ' activos',
    alinear: 'derecha',
    celda: (a) => <span className="dato font-semibold">{a.cantidadAjustadores}</span>,
  },
  {
    id: 'estado',
    encabezado: 'Estado',
    celda: (a) => <EstadoRegistro eliminado={a.eliminado} fechaBaja={a.fechaBaja} />,
  },
]

// CU-02 Administrar aseguradoras (E2-01)
export function AseguradorasPage() {
  const { aseguradoras } = useLoaderData<typeof cargarAseguradoras>()
  const revalidator = useRevalidator()
  // El filtro queda en la dirección (?bajas=1): sobrevive a recargar y a volver atrás
  const [params, setParams] = useSearchParams()
  const mostrarBajas = params.get('bajas') === '1'
  const [busqueda, setBusqueda] = useState('')
  const [mensaje, setMensaje] = useState<string | null>(null)

  const [edicion, setEdicion] = useState<EdicionAseguradora | null>(null)
  const [edicionAbierta, setEdicionAbierta] = useState(false)
  const [cambio, setCambio] = useState<CambioEstado | null>(null)
  const [cambioAbierto, setCambioAbierto] = useState(false)

  // Al cerrar un diálogo abierto desde el menú ⋮, el foco vuelve a ese botón; si la fila ya no está (se dio de
  // baja y no se muestran las bajas), al título del listado
  const volverA = useRef<HTMLElement | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const elementoAlCerrar = () =>
    volverA.current?.isConnected ? volverA.current : (titulo.current ?? null)

  const activas = aseguradoras.filter((a) => !a.eliminado)
  const ajustadores = activas.reduce((total, a) => total + a.cantidadAjustadores, 0)
  const bajas = aseguradoras.length - activas.length
  const buscado = normalizarBusqueda(busqueda)
  const visibles = aseguradoras.filter(
    (a) => (mostrarBajas || !a.eliminado) && normalizarBusqueda(a.nombre).includes(buscado),
  )

  function abrirEdicion(
    valor: EdicionAseguradora,
    // Sin disparador (botón "Nueva aseguradora"): vuelve al botón que tenía el foco
    disparador = document.activeElement instanceof HTMLElement ? document.activeElement : null,
  ) {
    volverA.current = disparador
    setMensaje(null)
    setEdicion(valor)
    setEdicionAbierta(true)
  }
  function abrirCambio(valor: CambioEstado, disparador: HTMLElement | null) {
    volverA.current = disparador
    setMensaje(null)
    setCambio(valor)
    setCambioAbierto(true)
  }
  function terminar(texto: string) {
    setEdicionAbierta(false)
    setCambioAbierto(false)
    setMensaje(texto)
    void revalidator.revalidate()
  }

  const acciones = (aseguradora: AseguradoraListado): AccionFila[] =>
    aseguradora.eliminado
      ? [
          {
            etiqueta: 'Reactivar',
            icono: <RotateCcw aria-hidden="true" />,
            onSelect: (d) => abrirCambio({ tipo: 'reactivar', aseguradora }, d),
          },
        ]
      : [
          {
            etiqueta: 'Modificar',
            icono: <Pencil aria-hidden="true" />,
            onSelect: (d) => abrirEdicion({ tipo: 'modificar', aseguradora }, d),
          },
          {
            etiqueta: 'Dar de baja',
            icono: <CircleMinus aria-hidden="true" />,
            peligro: true,
            onSelect: (d) => abrirCambio({ tipo: 'baja', aseguradora }, d),
          },
        ]

  return (
    <>
      <SectionHeading section="aseguradoras" />

      <BarraAbm
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholderBusqueda="Buscar por nombre"
        mostrarBajas={mostrarBajas}
        onMostrarBajas={(mostrar) =>
          setParams(
            (actuales) => {
              if (mostrar) actuales.set('bajas', '1')
              else actuales.delete('bajas')
              return actuales
            },
            { replace: true, preventScrollReset: true },
          )
        }
        etiquetaAlta="Nueva aseguradora"
        onAlta={() => abrirEdicion({ tipo: 'nueva' })}
      />

      <ListadoAbm
        tituloRef={titulo}
        titulo={plural(visibles.length, 'aseguradora')}
        resumen={[
          plural(activas.length, 'activa'),
          plural(ajustadores, 'ajustador', 'ajustadores'),
          plural(bajas, 'dada de baja', 'dadas de baja'),
        ]}
        aviso={mensaje && <Aviso tipo="exito">{mensaje}</Aviso>}
        nota="Solo se puede dar de baja una aseguradora sin ajustadores activos. Sus siniestros se conservan y se puede reactivar en cualquier momento."
      >
        <TablaAbm
          filas={visibles}
          columnas={columnas}
          clave={(a) => a.id}
          nombre={(a) => a.nombre}
          acciones={acciones}
          etiqueta="Listado de aseguradoras"
          vacio={
            <div className="grid justify-items-center gap-2">
              <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
              {buscado ? (
                <>
                  <p className="font-semibold">
                    No hay aseguradoras que coincidan con «{busqueda}».
                  </p>
                  <p className="text-muted-foreground">
                    {mostrarBajas
                      ? 'Probá con otro nombre.'
                      : 'Probá con otro nombre o marcá «Mostrar dadas de baja».'}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold">Todavía no hay aseguradoras activas.</p>
                  <p className="text-muted-foreground">Creá la primera con «Nueva aseguradora».</p>
                </>
              )}
            </div>
          }
        />
      </ListadoAbm>

      <AseguradoraDialog
        abierto={edicionAbierta}
        elementoAlCerrar={elementoAlCerrar}
        edicion={edicion}
        onCerrar={() => setEdicionAbierta(false)}
        onGuardada={terminar}
      />
      <EstadoAseguradoraDialog
        abierto={cambioAbierto}
        elementoAlCerrar={elementoAlCerrar}
        cambio={cambio}
        onCerrar={() => setCambioAbierto(false)}
        onHecho={terminar}
      />
    </>
  )
}
