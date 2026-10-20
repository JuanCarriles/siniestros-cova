import { useRef, useState } from 'react'
import { Link, useLoaderData, useLocation, useRevalidator, useSearchParams } from 'react-router'
import { ChevronLeft, CircleMinus, Pencil, RotateCcw, SearchX } from 'lucide-react'
import type { AjustadorListado } from '@cova/shared/schemas/ajustadores'
import { BarraAbm } from '@/components/abm/barra-abm'
import { EstadoRegistro } from '@/components/abm/estado-registro'
import { FiltroAbm } from '@/components/abm/filtro-abm'
import { ListadoAbm } from '@/components/abm/listado-abm'
import type { AccionFila } from '@/components/abm/menu-acciones'
import { TablaAbm, type ColumnaAbm } from '@/components/abm/tabla-abm'
import { Aviso } from '@/components/aviso'
import { SectionHeading } from '@/components/layout/section-heading'
import { Button } from '@/components/ui/button'
import { normalizarBusqueda, plural } from '@/lib/texto'
import type { cargarAjustadores } from '../loader'
import { AjustadorDialog, type EdicionAjustador } from '../components/ajustador-dialog'
import {
  EstadoAjustadorDialog,
  type CambioEstadoAjustador,
} from '../components/estado-ajustador-dialog'

const nombre = (a: AjustadorListado) => `${a.nombres} ${a.apellidos}`

// Si no entra en la columna, el email se corta antes de la @ (dos renglones como mucho), no a mitad de palabra
const emailCortable = (email: string) => {
  const arroba = email.lastIndexOf('@')
  if (arroba <= 0) return email
  return (
    <>
      {email.slice(0, arroba)}
      <wbr />
      {email.slice(arroba)}
    </>
  )
}

// CU-03 paso 2: nombre, email, teléfono, aseguradora, casos activos y estado. Email y teléfono comparten la
// columna "Contacto": con columnas separadas la tabla no entra a 1280 px sin desplazarse de costado (RNF-02).
const columnas: ColumnaAbm<AjustadorListado>[] = [
  { id: 'nombre', encabezado: 'Nombre y apellido', principal: true, celda: nombre },
  {
    id: 'contacto',
    encabezado: 'Contacto',
    celda: (a) => (
      <span className="grid gap-1">
        <span>{emailCortable(a.email)}</span>
        <span className="dato whitespace-nowrap">{a.telefono}</span>
      </span>
    ),
  },
  { id: 'aseguradora', encabezado: 'Aseguradora', celda: (a) => a.aseguradora.nombre },
  {
    id: 'casos',
    encabezado: 'Casos activos',
    alinear: 'derecha',
    celda: (a) => (
      <span className={a.casosActivos > 0 ? 'dato font-semibold' : 'dato text-muted-foreground'}>
        {a.casosActivos}
      </span>
    ),
  },
  {
    id: 'estado',
    encabezado: 'Estado',
    celda: (a) => (
      <EstadoRegistro eliminado={a.eliminado} fechaBaja={a.fechaBaja} genero="masculino" />
    ),
  },
]

// Desde Aseguradoras se llega con este estado: muestra "Volver a aseguradoras"
export type DesdeAseguradoras = { desde: 'aseguradoras' }

// CU-03 Administrar ajustadores (E2-03). El filtro por aseguradora y "Mostrar dados de baja" quedan en la
// dirección (/ajustadores?aseguradora=3&bajas=1): Aseguradoras enlaza acá ya filtrado.
export function AjustadoresPage() {
  const { ajustadores, aseguradoras } = useLoaderData<typeof cargarAjustadores>()
  const revalidator = useRevalidator()
  const location = useLocation()
  const vieneDeAseguradoras = (location.state as DesdeAseguradoras | null)?.desde === 'aseguradoras'
  const [params, setParams] = useSearchParams()
  const mostrarBajas = params.get('bajas') === '1'
  const idFiltro = params.get('aseguradora')
  const aseguradoraFiltro = aseguradoras.find((a) => String(a.id) === idFiltro) ?? null
  const [busqueda, setBusqueda] = useState('')
  const [mensaje, setMensaje] = useState<string | null>(null)

  const [edicion, setEdicion] = useState<EdicionAjustador | null>(null)
  const [edicionAbierta, setEdicionAbierta] = useState(false)
  const [cambio, setCambio] = useState<CambioEstadoAjustador | null>(null)
  const [cambioAbierto, setCambioAbierto] = useState(false)

  // Al cerrar un diálogo abierto desde el menú ⋮, el foco vuelve a ese botón; si la fila ya no está, al título
  const volverA = useRef<HTMLElement | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const elementoAlCerrar = () =>
    volverA.current?.isConnected ? volverA.current : (titulo.current ?? null)

  function cambiarParam(clave: string, valor: string | null) {
    setParams(
      (actuales) => {
        if (valor === null) actuales.delete(clave)
        else actuales.set(clave, valor)
        return actuales
      },
      // Conserva el estado de navegación: "Volver a aseguradoras" sigue a la vista al cambiar un filtro
      { replace: true, preventScrollReset: true, state: location.state as unknown },
    )
  }

  // El resumen y el título siguen al filtro de aseguradora; la búsqueda solo cambia las filas
  const deLaAseguradora = aseguradoraFiltro
    ? ajustadores.filter((a) => a.aseguradora.id === aseguradoraFiltro.id)
    : ajustadores
  const activos = deLaAseguradora.filter((a) => !a.eliminado)
  const casos = activos.reduce((total, a) => total + a.casosActivos, 0)
  const bajas = deLaAseguradora.length - activos.length
  const buscado = normalizarBusqueda(busqueda)
  const visibles = deLaAseguradora.filter(
    (a) =>
      (mostrarBajas || !a.eliminado) &&
      normalizarBusqueda(`${nombre(a)} ${a.email}`).includes(buscado),
  )

  // Las dadas de baja solo aparecen si tienen ajustadores (para poder verlos con "Mostrar dados de baja")
  const opcionesFiltro = aseguradoras
    .filter((a) => !a.eliminado || ajustadores.some((j) => j.aseguradora.id === a.id))
    .map((a) => ({
      valor: String(a.id),
      etiqueta: a.eliminado ? `${a.nombre} (dada de baja)` : a.nombre,
    }))

  function abrirEdicion(
    valor: EdicionAjustador,
    // Sin disparador (botón "Nuevo ajustador"): vuelve al botón que tenía el foco
    disparador = document.activeElement instanceof HTMLElement ? document.activeElement : null,
  ) {
    volverA.current = disparador
    setMensaje(null)
    setEdicion(valor)
    setEdicionAbierta(true)
  }
  function abrirCambio(valor: CambioEstadoAjustador, disparador: HTMLElement | null) {
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

  const acciones = (ajustador: AjustadorListado): AccionFila[] =>
    ajustador.eliminado
      ? [
          {
            etiqueta: 'Reactivar',
            icono: <RotateCcw aria-hidden="true" />,
            onSelect: (d) => abrirCambio({ tipo: 'reactivar', ajustador }, d),
          },
        ]
      : [
          {
            etiqueta: 'Modificar',
            icono: <Pencil aria-hidden="true" />,
            onSelect: (d) => abrirEdicion({ tipo: 'modificar', ajustador }, d),
          },
          {
            etiqueta: 'Dar de baja',
            icono: <CircleMinus aria-hidden="true" />,
            peligro: true,
            onSelect: (d) => abrirCambio({ tipo: 'baja', ajustador }, d),
          },
        ]

  let vacio = (
    <>
      <p className="font-semibold">Todavía no hay ajustadores activos.</p>
      <p className="text-muted-foreground">Creá el primero con «Nuevo ajustador».</p>
    </>
  )
  if (buscado) {
    vacio = (
      <>
        <p className="font-semibold">No hay ajustadores que coincidan con «{busqueda}».</p>
        <p className="text-muted-foreground">
          {mostrarBajas
            ? 'Probá con otro nombre o email.'
            : 'Probá con otro nombre o email, o marcá «Mostrar dados de baja».'}
        </p>
      </>
    )
  } else if (aseguradoraFiltro) {
    vacio = (
      <>
        <p className="font-semibold">{aseguradoraFiltro.nombre} no tiene ajustadores activos.</p>
        <p className="text-muted-foreground">
          {aseguradoraFiltro.eliminado
            ? 'Marcá «Mostrar dados de baja» para ver los que tuvo.'
            : 'Agregale uno con «Nuevo ajustador».'}
        </p>
      </>
    )
  }

  return (
    <>
      {vieneDeAseguradoras && (
        <Button asChild variant="link" className="mb-3 px-0">
          <Link to="/aseguradoras">
            <ChevronLeft aria-hidden="true" /> Volver a aseguradoras
          </Link>
        </Button>
      )}
      <SectionHeading section="ajustadores" />

      <BarraAbm
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholderBusqueda="Buscar por nombre o email"
        filtros={
          <FiltroAbm
            etiqueta="Filtrar por aseguradora"
            textoTodas="Todas las aseguradoras"
            valor={aseguradoraFiltro ? String(aseguradoraFiltro.id) : null}
            onCambio={(valor) => cambiarParam('aseguradora', valor)}
            opciones={opcionesFiltro}
          />
        }
        mostrarBajas={mostrarBajas}
        onMostrarBajas={(mostrar) => cambiarParam('bajas', mostrar ? '1' : null)}
        etiquetaBajas="Mostrar dados de baja"
        etiquetaAlta="Nuevo ajustador"
        onAlta={() =>
          abrirEdicion({
            tipo: 'nuevo',
            // Filtrado por una aseguradora activa: el alta ya la trae elegida
            idAseguradora:
              aseguradoraFiltro && !aseguradoraFiltro.eliminado ? aseguradoraFiltro.id : undefined,
          })
        }
      />

      <ListadoAbm
        tituloRef={titulo}
        titulo={
          aseguradoraFiltro
            ? `${plural(visibles.length, 'ajustador', 'ajustadores')} de ${aseguradoraFiltro.nombre}`
            : plural(visibles.length, 'ajustador', 'ajustadores')
        }
        resumen={[
          plural(activos.length, 'activo'),
          plural(casos, 'caso activo', 'casos activos'),
          plural(bajas, 'dado de baja', 'dados de baja'),
        ]}
        aviso={mensaje && <Aviso tipo="exito">{mensaje}</Aviso>}
        nota="Solo se puede dar de baja a un ajustador sin siniestros activos. Al darlo de baja deja de aparecer para asignarlo a siniestros nuevos; sus siniestros se conservan."
      >
        <TablaAbm
          filas={visibles}
          columnas={columnas}
          clave={(a) => a.id}
          nombre={nombre}
          acciones={acciones}
          etiqueta="Listado de ajustadores"
          vacio={
            <div className="grid justify-items-center gap-2">
              <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
              {vacio}
            </div>
          }
        />
      </ListadoAbm>

      <AjustadorDialog
        abierto={edicionAbierta}
        elementoAlCerrar={elementoAlCerrar}
        edicion={edicion}
        aseguradoras={aseguradoras}
        onCerrar={() => setEdicionAbierta(false)}
        onGuardado={terminar}
      />
      <EstadoAjustadorDialog
        abierto={cambioAbierto}
        elementoAlCerrar={elementoAlCerrar}
        cambio={cambio}
        onCerrar={() => setCambioAbierto(false)}
        onHecho={terminar}
        onDesactualizado={() => void revalidator.revalidate()}
      />
    </>
  )
}
