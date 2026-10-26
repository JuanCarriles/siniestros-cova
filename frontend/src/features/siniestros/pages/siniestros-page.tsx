import { useEffect, useRef, useState } from 'react'
import {
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
  useRevalidator,
  useSearchParams,
} from 'react-router'
import { CircleMinus, Eye, MoveHorizontal, PanelLeftClose, Trash2 } from 'lucide-react'
import {
  DIAS_ALERTA,
  esCierreEnviado,
  DIAS_DEMORADO,
  parametrosListadoValidos,
  POR_PAGINA,
  type OrdenSiniestros,
  type SiniestroListado,
} from '@cova/shared/schemas/siniestros'
import { Aviso } from '@/components/aviso'
import {
  OperacionSiniestroDialog,
  type OperacionSiniestro,
} from '../components/operacion-siniestro-dialog'
import { BarraAbm } from '@/components/abm/barra-abm'
import type { AccionFila } from '@/components/abm/menu-acciones'
import { FiltroAbm } from '@/components/abm/filtro-abm'
import { FiltrosActivos, type FiltroActivo } from '@/components/abm/filtros-activos'
import { ListadoAbm } from '@/components/abm/listado-abm'
import { usePanel } from '@/components/layout/panel-context'
import { SectionHeading } from '@/components/layout/section-heading'
import { Paginacion } from '@/components/paginacion'
import { Button } from '@/components/ui/button'
import { plural } from '@/lib/texto'
import { cn } from '@/lib/utils'
import { columnasDelRol } from '../columnas'
import { DiasSinMovimiento } from '../components/celdas-siniestro'
import { ListadoVacio } from '../components/listado-vacio'
import { PartesDialog, type PedidoPartes, type VistaPartes } from '../components/partes-dialog'
import { SelectorColumnas } from '../components/selector-columnas'
import { TablaSiniestros } from '../components/tabla-siniestros'
import { TarjetaSiniestro } from '../components/tarjeta-siniestro'
import { useColumnasVisibles } from '../hooks/use-columnas-visibles'
import type { cargarSiniestros } from '../loader'

const FILTROS = ['q', 'estado', 'aseguradora', 'gestor', 'bajas'] as const

// CU-09 paso 2 y 2.a (E4-01): listado de siniestros. Filtros, búsqueda, orden y página van en la dirección y los
// resuelve el servidor; la tabla muestra la página pedida.
export function SiniestrosPage() {
  const { pagina, opciones } = useLoaderData<typeof cargarSiniestros>()
  const { usuario, basePath, menuLateral } = usePanel()
  const esGestor = usuario.tipo === 'GESTOR'
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const navigation = useNavigation()
  const cargando =
    navigation.state === 'loading' && navigation.location.pathname === location.pathname
  const orden: OrdenSiniestros = params.get('orden') === 'demora' ? 'demora' : 'asignacion'

  const columnasRol = columnasDelRol(esGestor)
  const columnas = useColumnasVisibles()
  const visibles = columnasRol.filter((c) => columnas.visible(c.id))
  const [pedido, setPedido] = useState<PedidoPartes | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const revalidator = useRevalidator()
  const [operacion, setOperacion] = useState<OperacionSiniestro | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const origenOperacion = useRef<HTMLButtonElement | null>(null)
  function abrirOperacion(
    tipo: OperacionSiniestro['tipo'],
    siniestro: SiniestroListado,
    origen: HTMLButtonElement | null,
  ) {
    origenOperacion.current = origen
    setMensaje(null)
    setOperacion({ tipo, siniestro })
  }

  // Cambia filtros en la dirección; cualquier filtro nuevo vuelve a la primera página
  function cambiar(valores: Record<string, string | null>) {
    setParams(
      (actuales) => {
        for (const [clave, valor] of Object.entries(valores)) {
          if (valor === null || valor === '') actuales.delete(clave)
          else actuales.set(clave, valor)
        }
        if (!('pagina' in valores)) actuales.delete('pagina')
        return actuales
      },
      { replace: true, preventScrollReset: true },
    )
  }
  const href = (valores: Record<string, string | null>) => {
    const nuevos = new URLSearchParams(params)
    for (const [clave, valor] of Object.entries(valores)) {
      if (valor === null) nuevos.delete(clave)
      else nuevos.set(clave, valor)
    }
    const texto = nuevos.toString()
    return texto ? `?${texto}` : location.pathname
  }

  // Lo que realmente se envía al servidor: los chips, el campo y el estado vacío se basan en esto, no en la dirección
  // tal cual (un valor inválido se descarta en los dos lados por igual)
  const validos = parametrosListadoValidos(params)

  // Búsqueda: consulta al servidor cuando se deja de escribir
  const q = (validos.q ?? '').trim()
  const [busqueda, setBusqueda] = useState(q)
  // Si la búsqueda de la dirección cambia por otro camino (Atrás, Adelante, un enlace), el campo la acompaña. Cuando
  // cambia porque se escribió, ya coinciden y no se toca lo que se está escribiendo.
  const [qAnterior, setQAnterior] = useState(q)
  if (q !== qAnterior) {
    setQAnterior(q)
    if (q !== busqueda.trim()) setBusqueda(q)
  }
  useEffect(() => {
    const texto = busqueda.trim()
    if (texto === q) return
    const espera = setTimeout(() => cambiar({ q: texto || null }), 400)
    return () => clearTimeout(espera)
    // cambiar depende de params: alcanza con reaccionar al texto escrito
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])

  // Al cambiar de página, el foco y la vista vuelven al principio del listado
  const primeraVez = useRef(true)
  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false
      return
    }
    titulo.current?.focus({ preventScroll: true })
    titulo.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [pagina.pagina])

  const verPartes = (siniestro: SiniestroListado, vista: VistaPartes) =>
    setPedido({
      siniestro: { id: siniestro.id, numeroSiniestro: siniestro.numeroSiniestro },
      vista,
    })
  const hrefSiniestro = (id: number) => `${basePath}/siniestros/${id}`

  // CU-09 3.d/3.e. El servidor vuelve a validar rol, estado y número al confirmar.
  const acciones = (s: SiniestroListado): AccionFila[] => [
    ...(!s.eliminacionEnCurso
      ? [
          {
            etiqueta: 'Ver detalle',
            icono: <Eye aria-hidden="true" />,
            onSelect: () => void navigate(hrefSiniestro(s.id)),
          },
        ]
      : []),
    ...(esGestor
      ? []
      : [
          ...(!s.eliminado && !s.eliminacionEnCurso
            ? [
                {
                  etiqueta: 'Dar de baja',
                  icono: <CircleMinus aria-hidden="true" />,
                  peligro: true,
                  onSelect: (origen: HTMLButtonElement | null) => abrirOperacion('baja', s, origen),
                },
              ]
            : []),
          ...(esCierreEnviado(s.estado)
            ? [
                {
                  etiqueta: s.eliminacionEnCurso ? 'Reintentar eliminación' : 'Eliminar',
                  icono: <Trash2 aria-hidden="true" />,
                  peligro: true,
                  onSelect: (origen: HTMLButtonElement | null) =>
                    abrirOperacion('eliminar', s, origen),
                },
              ]
            : []),
        ]),
  ]

  // Búsqueda y filtros aplicados, en palabras: los muestran los chips de arriba y el estado vacío (E4-02). Un filtro
  // que el servidor recibe pero no figura en el catálogo (un enlace viejo, algo dado de baja) se muestra igual, como
  // "no disponible", para que se vea y se pueda quitar.
  const filtroDe = (
    clave: 'estado' | 'aseguradora' | 'gestor',
    etiqueta: string,
    lista: { id: number; nombre: string }[],
  ): FiltroActivo | null => {
    const id = validos[clave]
    if (!id) return null
    const nombre = lista.find((o) => String(o.id) === id)?.nombre
    return { clave, etiqueta, valor: nombre ?? 'no disponible' }
  }
  const activos = [
    q ? { clave: 'q', etiqueta: 'Búsqueda', valor: `«${q}»` } : null,
    filtroDe('estado', 'Estado', opciones.estados),
    filtroDe('aseguradora', 'Aseguradora', opciones.aseguradoras),
    // El servidor no aplica estos dos para el gestor (RF-17): no se muestran
    esGestor ? null : filtroDe('gestor', 'Gestor', opciones.gestores),
    !esGestor && validos.bajas === 'true'
      ? { clave: 'bajas', etiqueta: 'Incluye', valor: 'dados de baja' }
      : null,
  ].filter((f): f is FiltroActivo => f !== null)

  // También vacía el campo: si había una búsqueda a medio escribir, su espera se cancela y no vuelve a aplicarse
  function quitarFiltro(clave: string) {
    if (clave === 'q') setBusqueda('')
    cambiar({ [clave]: null })
  }
  function quitarTodos() {
    setBusqueda('')
    cambiar(Object.fromEntries(FILTROS.map((clave) => [clave, null])))
  }

  return (
    <>
      <SectionHeading section="siniestros" titulo={esGestor ? 'Mis siniestros' : undefined} />

      <BarraAbm
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholderBusqueda="Buscar por número, póliza, persona o patente"
        filtros={
          <>
            <FiltroAbm
              etiqueta="Filtrar por estado"
              textoTodas="Todos los estados"
              valor={params.get('estado')}
              onCambio={(valor) => cambiar({ estado: valor })}
              opciones={opciones.estados.map((e) => ({ valor: String(e.id), etiqueta: e.nombre }))}
            />
            <FiltroAbm
              etiqueta="Filtrar por aseguradora"
              textoTodas="Todas las aseguradoras"
              valor={params.get('aseguradora')}
              onCambio={(valor) => cambiar({ aseguradora: valor })}
              opciones={opciones.aseguradoras.map((a) => ({
                valor: String(a.id),
                etiqueta: a.eliminado ? `${a.nombre} (dada de baja)` : a.nombre,
              }))}
            />
            {!esGestor && (
              <FiltroAbm
                etiqueta="Filtrar por gestor"
                textoTodas="Todos los gestores"
                valor={params.get('gestor')}
                onCambio={(valor) => cambiar({ gestor: valor })}
                opciones={opciones.gestores.map((g) => ({
                  valor: String(g.id),
                  etiqueta: g.eliminado ? `${g.nombre} (dado de baja)` : g.nombre,
                }))}
              />
            )}
            <FiltroAbm
              etiqueta="Ordenar"
              textoTodas="Más recientes primero"
              valor={orden === 'demora' ? 'demora' : null}
              onCambio={(valor) => cambiar({ orden: valor })}
              opciones={[{ valor: 'demora', etiqueta: 'Más demorados primero' }]}
            />
          </>
        }
        mostrarBajas={esGestor ? undefined : params.get('bajas') === 'true'}
        onMostrarBajas={
          esGestor ? undefined : (mostrar) => cambiar({ bajas: mostrar ? 'true' : null })
        }
        etiquetaBajas="Mostrar dados de baja"
      />

      <FiltrosActivos filtros={activos} onQuitar={quitarFiltro} onQuitarTodos={quitarTodos} />

      <ListadoAbm
        aviso={mensaje && <Aviso tipo="exito">{mensaje}</Aviso>}
        tituloRef={titulo}
        titulo={plural(pagina.total, 'siniestro')}
        resumen={[
          plural(pagina.resumen.activos, 'activo'),
          plural(pagina.resumen.demorados, 'demorado'),
          ...(esGestor ? [] : [plural(pagina.resumen.bajas, 'dado de baja', 'dados de baja')]),
        ]}
        acciones={
          <div className="hidden md:block">
            <SelectorColumnas columnas={columnasRol} {...columnas} />
          </div>
        }
        nota={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1.5">
            Días sin movimiento:
            <DiasSinMovimiento dias={DIAS_DEMORADO} cerrado={false} />
            demorado, de {DIAS_DEMORADO} a {DIAS_ALERTA - 1} días ·
            <DiasSinMovimiento dias={DIAS_ALERTA} cerrado={false} />
            {DIAS_ALERTA} días o más. Los cerrados no se marcan.
          </span>
        }
      >
        <div aria-busy={cargando} className={cn('transition-opacity', cargando && 'opacity-60')}>
          {pagina.siniestros.length === 0 ? (
            <ListadoVacio
              esGestor={esGestor}
              filtros={activos}
              // El resumen cuenta los dados de baja que coinciden aunque no se muestren
              bajasQueCoinciden={esGestor || validos.bajas === 'true' ? 0 : pagina.resumen.bajas}
              onMostrarBajas={() => cambiar({ bajas: 'true' })}
              onQuitarTodos={quitarTodos}
            />
          ) : (
            <>
              <div className="hidden md:block">
                <TablaSiniestros
                  siniestros={pagina.siniestros}
                  columnas={visibles}
                  orden={orden}
                  hrefOrden={(nuevo) =>
                    href({ orden: nuevo === 'demora' ? 'demora' : null, pagina: null })
                  }
                  hrefSiniestro={hrefSiniestro}
                  onVer={verPartes}
                  acciones={acciones}
                  avisoDesborde={
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-info-bg px-4 py-3 text-info-ink sm:px-6">
                      <MoveHorizontal className="size-5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        La tabla no entra completa: se desplaza de costado.{' '}
                        {menuLateral.contraido
                          ? 'Para verla entera, ocultá algunas columnas desde «Columnas».'
                          : 'Para verla entera, achicá el menú lateral u ocultá algunas columnas.'}
                      </span>
                      {!menuLateral.contraido && (
                        <Button variant="outline" size="sm" onClick={menuLateral.alternar}>
                          <PanelLeftClose aria-hidden="true" />
                          Achicar el menú
                        </Button>
                      )}
                    </p>
                  }
                />
              </div>
              {/* Tarjetas separadas, con borde marcado, sobre el fondo gris: cada caso se distingue de un vistazo */}
              <ul
                className="grid gap-4 bg-surface-subtle p-3 sm:p-4 md:hidden"
                aria-label="Listado de siniestros"
              >
                {pagina.siniestros.map((s) => (
                  <li
                    key={s.id}
                    className={cn(
                      'rounded-xl border-2 bg-surface shadow-card',
                      s.eliminado ? 'border-destructive' : 'border-line-strong',
                    )}
                  >
                    <TarjetaSiniestro
                      siniestro={s}
                      href={hrefSiniestro(s.id)}
                      esGestor={esGestor}
                      onVer={verPartes}
                      acciones={acciones(s)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
          <Paginacion
            pagina={pagina.pagina}
            porPagina={pagina.porPagina}
            total={pagina.total}
            nombre="siniestros"
            hrefPagina={(n) => href({ pagina: n === 1 ? null : String(n) })}
            opcionesPorPagina={POR_PAGINA}
            onPorPagina={(n) => cambiar({ porPagina: n === POR_PAGINA[0] ? null : String(n) })}
          />
        </div>
      </ListadoAbm>

      {operacion && (
        <OperacionSiniestroDialog
          key={`${operacion.tipo}-${operacion.siniestro.id}`}
          operacion={operacion}
          onCerrar={() => setOperacion(null)}
          onHecho={(texto) => {
            setOperacion(null)
            setMensaje(texto)
            void revalidator.revalidate()
          }}
          onDesactualizado={() => void revalidator.revalidate()}
          elementoAlCerrar={(completado) =>
            !completado && origenOperacion.current?.isConnected
              ? origenOperacion.current
              : titulo.current
          }
        />
      )}
      <PartesDialog pedido={pedido} onCerrar={() => setPedido(null)} />
    </>
  )
}
