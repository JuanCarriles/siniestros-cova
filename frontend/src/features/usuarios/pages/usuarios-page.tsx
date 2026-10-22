import { useRef, useState } from 'react'
import { useLoaderData, useRevalidator, useSearchParams, useNavigate } from 'react-router'
import { CircleMinus, Pencil, RotateCcw, SearchX, UserRound } from 'lucide-react'
import { tiposUsuarioAdministrables, type UsuarioListado } from '@cova/shared/schemas/usuarios-abm'
import { BarraAbm } from '@/components/abm/barra-abm'
import { FiltroAbm } from '@/components/abm/filtro-abm'
import { EstadoRegistro } from '@/components/abm/estado-registro'
import { ListadoAbm } from '@/components/abm/listado-abm'
import { TablaAbm, type ColumnaAbm } from '@/components/abm/tabla-abm'
import type { AccionFila } from '@/components/abm/menu-acciones'
import { SectionHeading } from '@/components/layout/section-heading'
import { roleLabels } from '@/components/layout/panel-navigation'
import { Badge } from '@/components/ui/badge'
import { usePanel } from '@/components/layout/panel-context'
import { Aviso } from '@/components/aviso'
import { normalizarBusqueda, plural } from '@/lib/texto'
import type { cargarUsuarios } from '../loader'
import { UsuarioDialog } from '../components/usuario-dialog'
import { EstadoUsuarioDialog, type CambioEstadoUsuario } from '../components/estado-usuario-dialog'

const nombre = (u: UsuarioListado) => `${u.nombres} ${u.apellidos}`
function emailCortable(email: string) {
  const arroba = email.lastIndexOf('@')
  return (
    <>
      {email.slice(0, arroba)}
      <wbr />
      {email.slice(arroba)}
    </>
  )
}
const columnas: ColumnaAbm<UsuarioListado>[] = [
  { id: 'nombre', encabezado: 'Nombre y apellido', principal: true, celda: nombre },
  {
    id: 'contacto',
    encabezado: 'Email y teléfono',
    celda: (u) => (
      <span className="grid gap-1">
        <span className="[overflow-wrap:anywhere]">{emailCortable(u.email)}</span>
        <span className="dato">{u.telefono}</span>
      </span>
    ),
  },
  {
    id: 'tipo',
    encabezado: 'Tipo',
    celda: (u) => <span className="font-medium">{roleLabels[u.tipoUsuario]}</span>,
  },
  {
    id: 'casos',
    encabezado: 'Casos activos',
    alinear: 'derecha',
    celda: (u) => <span className="dato font-semibold">{u.casosActivos}</span>,
  },
  {
    id: 'estado',
    encabezado: 'Estado',
    celda: (u) => (
      <EstadoRegistro eliminado={u.eliminado} fechaBaja={u.fechaBaja} genero="masculino" />
    ),
  },
]

export function UsuariosPage() {
  const { usuarios, catalogos, actor } = useLoaderData<typeof cargarUsuarios>()
  const revalidator = useRevalidator()
  const navigate = useNavigate()
  const { basePath } = usePanel()
  const columnasConIdentidad = columnas.map((columna) =>
    columna.id !== 'nombre'
      ? columna
      : {
          ...columna,
          celda: (u: UsuarioListado) => (
            <span className="inline-flex flex-wrap items-center gap-2">
              {nombre(u)}
              {u.id === actor.id && <Badge variant="info">Vos</Badge>}
            </span>
          ),
        },
  )
  const [params, setParams] = useSearchParams()
  const [busqueda, setBusqueda] = useState('')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [edicion, setEdicion] = useState<{ usuario: UsuarioListado | null } | null>(null)
  const [cambio, setCambio] = useState<CambioEstadoUsuario | null>(null)
  const volverA = useRef<HTMLElement | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const elementoAlCerrar = () => (volverA.current?.isConnected ? volverA.current : titulo.current)
  const mostrarBajas = params.get('bajas') === '1'
  const tipo = params.get('tipo')
  const tipos = tiposUsuarioAdministrables(actor.tipoUsuario)
  const buscado = normalizarBusqueda(busqueda)
  const filtrados = usuarios.filter((u) => !tipo || u.tipoUsuario === tipo)
  const visibles = filtrados.filter(
    (u) =>
      (mostrarBajas || !u.eliminado) &&
      normalizarBusqueda(`${nombre(u)} ${u.email} ${u.telefono}`).includes(buscado),
  )
  const activos = filtrados.filter((u) => !u.eliminado)

  function parametro(clave: string, valor: string | null) {
    setParams(
      (p) => {
        if (valor) p.set(clave, valor)
        else p.delete(clave)
        return p
      },
      { replace: true, preventScrollReset: true },
    )
  }
  function abrir(usuario: UsuarioListado | null, disparador: HTMLElement | null) {
    volverA.current = disparador
    setMensaje(null)
    setEdicion({ usuario })
  }
  function estado(
    usuario: UsuarioListado,
    accion: CambioEstadoUsuario['tipo'],
    disparador: HTMLElement | null,
  ) {
    volverA.current = disparador
    setMensaje(null)
    setCambio({ usuario, tipo: accion })
  }
  function terminar(texto: string) {
    setEdicion(null)
    setCambio(null)
    setMensaje(texto)
    void revalidator.revalidate()
  }
  function acciones(u: UsuarioListado): AccionFila[] {
    if (u.id === actor.id)
      return [
        {
          etiqueta: 'Ir a mi perfil',
          icono: <UserRound aria-hidden="true" />,
          onSelect: () => void navigate(`${basePath}/perfil`),
        },
      ]
    if (!tipos.includes(u.tipoUsuario))
      return [
        {
          etiqueta: 'Ver por qué no se puede modificar',
          icono: <CircleMinus aria-hidden="true" />,
          onSelect: (d) => estado(u, u.eliminado ? 'reactivacion' : 'baja', d),
        },
      ]
    if (u.eliminado)
      return [
        {
          etiqueta: 'Reactivar',
          icono: <RotateCcw aria-hidden="true" />,
          onSelect: (d) => estado(u, 'reactivacion', d),
        },
      ]
    return [
      { etiqueta: 'Modificar', icono: <Pencil aria-hidden="true" />, onSelect: (d) => abrir(u, d) },
      {
        etiqueta: 'Dar de baja',
        icono: <CircleMinus aria-hidden="true" />,
        peligro: true,
        onSelect: (d) => estado(u, 'baja', d),
      },
    ]
  }
  return (
    <>
      <SectionHeading section="usuarios" />
      <BarraAbm
        busqueda={busqueda}
        onBusqueda={setBusqueda}
        placeholderBusqueda="Buscar por nombre, email o teléfono"
        mostrarBajas={mostrarBajas}
        onMostrarBajas={(v) => parametro('bajas', v ? '1' : null)}
        etiquetaBajas="Mostrar dados de baja"
        etiquetaAlta="Nuevo usuario"
        onAlta={() =>
          abrir(null, document.activeElement instanceof HTMLElement ? document.activeElement : null)
        }
        filtros={
          <FiltroAbm
            etiqueta="Filtrar por tipo de usuario"
            textoTodas="Todos los tipos"
            valor={tipo}
            onCambio={(v) => parametro('tipo', v)}
            opciones={Object.entries(roleLabels).map(([valor, etiqueta]) => ({ valor, etiqueta }))}
          />
        }
      />
      <ListadoAbm
        tituloRef={titulo}
        titulo={plural(visibles.length, 'usuario')}
        resumen={[
          plural(activos.length, 'activo'),
          plural(
            activos.reduce((n, u) => n + u.casosActivos, 0),
            'caso activo',
            'casos activos',
          ),
          plural(filtrados.length - activos.length, 'dado de baja', 'dados de baja'),
        ]}
        aviso={mensaje && <Aviso tipo="exito">{mensaje}</Aviso>}
        nota="Solo podés crear y administrar usuarios de una jerarquía inferior a la tuya. Para dar de baja a alguien, primero debe quedar sin casos activos."
      >
        <TablaAbm
          filas={visibles}
          columnas={columnasConIdentidad}
          clave={(u) => u.id}
          nombre={nombre}
          acciones={acciones}
          etiqueta="Listado de usuarios"
          vacio={
            <div className="grid justify-items-center gap-2">
              <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-semibold">No hay usuarios para mostrar.</p>
              <p className="text-muted-foreground">
                Revisá los filtros o agregá uno con «Nuevo usuario».
              </p>
            </div>
          }
        />
      </ListadoAbm>
      <UsuarioDialog
        abierto={edicion !== null}
        usuario={edicion?.usuario ?? null}
        rol={actor.tipoUsuario}
        catalogos={catalogos}
        onCerrar={() => setEdicion(null)}
        onGuardado={terminar}
        elementoAlCerrar={elementoAlCerrar}
      />
      <EstadoUsuarioDialog
        key={cambio ? `${cambio.usuario.id}-${cambio.tipo}` : 'cerrado'}
        cambio={cambio}
        rol={actor.tipoUsuario}
        onCerrar={() => setCambio(null)}
        onHecho={terminar}
        onDesactualizado={() => void revalidator.revalidate()}
        elementoAlCerrar={elementoAlCerrar}
      />
    </>
  )
}
