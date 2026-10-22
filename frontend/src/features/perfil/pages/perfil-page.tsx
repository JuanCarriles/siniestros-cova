import { useEffect, useRef, useState } from 'react'
import { useLoaderData, useRevalidator } from 'react-router'
import { Check, KeyRound, LockKeyhole, Pencil, UserRound, Clock3 } from 'lucide-react'
import type { AlcancePerfil } from '@cova/shared/schemas/perfil'
import { roleLabels } from '@/components/layout/panel-navigation'
import { SectionHeading } from '@/components/layout/section-heading'
import { EstadoRegistro } from '@/components/abm/estado-registro'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Aviso } from '@/components/aviso'
import type { cargarPerfil } from '../loader'
import { PerfilDatosForm } from '../components/perfil-datos-form'
import { VerificarPerfilDialog } from '../components/verificar-perfil-dialog'
import { ContrasenaPerfilDialog } from '../components/contrasena-perfil-dialog'

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-base text-muted-foreground">{etiqueta}</dt>
      <dd className="font-medium [overflow-wrap:anywhere]">{valor || 'Sin completar'}</dd>
    </div>
  )
}

export function PerfilPage() {
  const { perfil, catalogos } = useLoaderData<typeof cargarPerfil>()
  const revalidator = useRevalidator()
  const [cambiandoContrasena, setCambiandoContrasena] = useState(false)
  const [verificacion, setVerificacion] = useState<AlcancePerfil | null>(null)
  // Solo vive mientras el formulario está montado; nunca se persiste en almacenamiento del navegador.
  const [edicion, setEdicion] = useState<{
    alcance: AlcancePerfil
    contrasenaActual: string
  } | null>(null)
  const editando = edicion?.alcance === 'datos'
  const [mensaje, setMensaje] = useState<string | null>(null)
  const modificar = useRef<HTMLButtonElement>(null)
  const cambiar = useRef<HTMLButtonElement>(null)
  const devolverFocoDatos = useRef(false)
  useEffect(() => {
    if (!editando && devolverFocoDatos.current) {
      devolverFocoDatos.current = false
      modificar.current?.focus()
    }
  }, [editando])
  function cerrarDatos() {
    devolverFocoDatos.current = true
    setEdicion(null)
  }
  const nombre = `${perfil.nombres} ${perfil.apellidos}`
  function solicitar(alcance: AlcancePerfil) {
    setMensaje(null)
    setVerificacion(alcance)
  }
  function habilitar(alcance: AlcancePerfil, contrasenaActual: string) {
    setVerificacion(null)
    setEdicion({ alcance, contrasenaActual })
  }
  function cancelarContrasena() {
    setCambiandoContrasena(false)
    cambiar.current?.focus()
  }
  return (
    <>
      <SectionHeading section="perfil" />
      {mensaje && (
        <Aviso tipo="exito" className="mb-5">
          {mensaje}
        </Aviso>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 gap-6">
          <section
            className="overflow-hidden rounded-xl border bg-card shadow-card"
            aria-labelledby="perfil-datos-titulo"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
              <h2
                id="perfil-datos-titulo"
                className="flex items-center gap-2 text-xl font-semibold text-primary"
              >
                <UserRound aria-hidden="true" />
                Datos personales
              </h2>
              {editando ? (
                <Badge variant="success">
                  <Check aria-hidden="true" />
                  Edición habilitada
                </Badge>
              ) : (
                <Button ref={modificar} variant="outline" onClick={() => solicitar('datos')}>
                  <Pencil aria-hidden="true" />
                  Modificar mis datos
                </Button>
              )}
            </div>
            <div className="p-5 sm:p-6">
              {editando ? (
                <PerfilDatosForm
                  perfil={perfil}
                  catalogos={catalogos}
                  contrasenaActual={edicion.contrasenaActual}
                  onCancelar={cerrarDatos}
                  onGuardado={() => {
                    cerrarDatos()
                    setMensaje('Se guardaron los cambios de tu perfil.')
                    void revalidator.revalidate()
                  }}
                />
              ) : (
                <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                  <Dato etiqueta="Nombres" valor={perfil.nombres} />
                  <Dato etiqueta="Apellidos" valor={perfil.apellidos} />
                  <Dato etiqueta="Documento" valor={perfil.documento} />
                  <Dato etiqueta="Teléfono" valor={perfil.telefono} />
                  <div className="sm:col-span-2">
                    <Dato etiqueta="Email" valor={perfil.email} />
                  </div>
                  <div className="border-t pt-4 sm:col-span-2">
                    <h3 className="font-semibold text-primary">Ubicación</h3>
                  </div>
                  <Dato etiqueta="País" valor={perfil.direccion.provincia?.pais.nombre} />
                  <Dato etiqueta="Provincia" valor={perfil.direccion.provincia?.nombre} />
                  <Dato etiqueta="Localidad" valor={perfil.direccion.localidad} />
                  <Dato etiqueta="Código postal" valor={perfil.direccion.codigoPostal} />
                  <Dato etiqueta="Calle y número" valor={perfil.direccion.calle} />
                  <Dato etiqueta="Piso y departamento" valor={perfil.direccion.pisoDepartamento} />
                </dl>
              )}
            </div>
          </section>
          <section
            className="rounded-xl border bg-card p-5 shadow-card sm:p-6"
            aria-labelledby="perfil-contrasena-titulo"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2
                  id="perfil-contrasena-titulo"
                  className="flex items-center gap-2 text-xl font-semibold text-primary"
                >
                  <LockKeyhole aria-hidden="true" />
                  Contraseña
                </h2>
                <p className="mt-2 text-muted-foreground">Tu contraseña se mantiene protegida.</p>
              </div>
              <Button
                ref={cambiar}
                variant="outline"
                disabled={editando}
                onClick={() => {
                  setMensaje(null)
                  setCambiandoContrasena(true)
                }}
              >
                <KeyRound aria-hidden="true" />
                Cambiar contraseña
              </Button>
            </div>
          </section>
          <section
            className="overflow-hidden rounded-xl border bg-card shadow-card"
            aria-labelledby="perfil-demorados-titulo"
          >
            <div className="border-b px-5 py-4 sm:px-6">
              <h2
                id="perfil-demorados-titulo"
                className="flex items-center gap-2 text-xl font-semibold text-primary"
              >
                <Clock3 aria-hidden="true" />
                Mis casos demorados
              </h2>
              <p className="mt-1 text-base text-muted-foreground">
                Casos activos con más de 72 horas sin movimiento.
              </p>
            </div>
            {perfil.demorados.length ? (
              <ul className="divide-y">
                {perfil.demorados.map((caso) => (
                  <li
                    key={caso.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"
                  >
                    <div>
                      <p className="dato font-semibold">{caso.numeroSiniestro}</p>
                      <p className="text-base text-muted-foreground">{caso.aseguradora}</p>
                    </div>
                    <Badge variant="warning">{caso.diasSinMovimiento} días sin movimiento</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-5 text-muted-foreground sm:p-6">No tenés casos demorados.</p>
            )}
          </section>
        </div>
        <aside
          className="order-first rounded-xl border bg-card p-5 shadow-card sm:p-6 xl:order-last"
          aria-labelledby="perfil-cuenta-titulo"
        >
          <div className="grid justify-items-center gap-2 border-b pb-5 text-center">
            <span
              className="grid size-18 place-items-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground"
              aria-hidden="true"
            >
              {perfil.nombres.charAt(0)}
              {perfil.apellidos.charAt(0)}
            </span>
            <p className="text-xl font-semibold">{nombre}</p>
            <Badge variant="info">{roleLabels[perfil.tipoUsuario]}</Badge>
          </div>
          <dl className="grid grid-cols-3 gap-2 border-b py-5 text-center">
            {[
              { etiqueta: 'Activos', cantidad: perfil.casosActivos, clase: 'text-primary' },
              {
                etiqueta: 'Al día',
                cantidad: perfil.casosActivos - perfil.casosDemorados,
                clase: 'text-ok-ink',
              },
              { etiqueta: 'Demorados', cantidad: perfil.casosDemorados, clase: 'text-warning-ink' },
            ].map((dato) => (
              <div key={dato.etiqueta}>
                <dd className={`dato text-2xl font-semibold ${dato.clase}`}>{dato.cantidad}</dd>
                <dt className="text-sm whitespace-nowrap text-muted-foreground">{dato.etiqueta}</dt>
              </div>
            ))}
          </dl>
          <h2 id="perfil-cuenta-titulo" className="mt-5 text-lg font-semibold text-primary">
            Datos de la cuenta
          </h2>
          <dl className="mt-4 grid gap-4">
            <Dato etiqueta="Tipo de usuario" valor={roleLabels[perfil.tipoUsuario]} />
            <div>
              <dt className="mb-1 text-base text-muted-foreground">Estado</dt>
              <dd>
                <EstadoRegistro
                  eliminado={perfil.eliminado}
                  fechaBaja={perfil.fechaBaja}
                  genero="masculino"
                />
              </dd>
            </div>
            <Dato
              etiqueta="Último ingreso"
              valor={
                perfil.ultimaConexion
                  ? new Intl.DateTimeFormat('es-AR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(perfil.ultimaConexion))
                  : null
              }
            />
          </dl>
          <p className="mt-5 border-t pt-4 text-base text-muted-foreground">
            El rol y el estado los gestiona la administración. No se modifican desde tu perfil.
          </p>
        </aside>
      </div>
      <VerificarPerfilDialog
        key={verificacion ?? 'cerrado'}
        alcance={verificacion}
        onCerrar={() => setVerificacion(null)}
        onVerificado={habilitar}
      />
      {cambiandoContrasena && (
        <ContrasenaPerfilDialog
          elementoAlCerrar={() => cambiar.current}
          onCerrar={cancelarContrasena}
          onGuardado={({ correoEnviado }) => {
            setEdicion(null)
            setCambiandoContrasena(false)
            // Recargar elimina los datos de sesión y contraseñas que vivían en memoria del panel.
            window.location.replace(
              `/login?motivo=contrasena-actualizada${correoEnviado ? '' : '&aviso=correo-no-enviado'}`,
            )
          }}
        />
      )}
    </>
  )
}
