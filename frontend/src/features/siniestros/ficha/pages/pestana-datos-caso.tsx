import { useRef, useState } from 'react'
import { useRevalidator } from 'react-router'
import { FileText, Flag, MapPin, Pencil, UsersRound, UserRoundCheck } from 'lucide-react'
import { usePanel } from '@/components/layout/panel-context'
import { Aviso } from '@/components/aviso'
import { Button } from '@/components/ui/button'
import { ReasignarSiniestroDialog } from '../components/reasignar-siniestro-dialog'
import { EditarDatosCaso } from '../components/editar-datos-caso'
import { actualizarNotificaciones } from '@/features/notificaciones/actualizar-notificaciones'
import { Badge } from '@/components/ui/badge'
import { Dato } from '../../components/dato'
import { BloqueFicha, PestanaFicha } from '../components/pestana-ficha'
import { dia } from '../formato'
import { useFicha } from '../hooks/use-ficha'

// Pestaña "Datos del caso" (CU-10 paso 1): póliza, asignación, el hecho y dónde pasó. Llega con la cabecera.
export function PestanaDatosCaso() {
  const ficha = useFicha()
  const { hecho, lugar } = ficha
  const { usuario } = usePanel()
  const revalidator = useRevalidator()
  const botonReasignar = useRef<HTMLButtonElement>(null)
  const [editando, setEditando] = useState(false)
  const [reasignando, setReasignando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [falloCorreo, setFalloCorreo] = useState(false)
  if (editando)
    return (
      <EditarDatosCaso
        ficha={ficha}
        onCancelar={() => setEditando(false)}
        onHecho={(resultado) => {
          setEditando(false)
          setMensaje(
            resultado.modificado
              ? 'Los datos del caso se actualizaron y el cambio quedó registrado en el historial.'
              : 'No había cambios para guardar.',
          )
          void revalidator.revalidate()
        }}
      />
    )
  return (
    <PestanaFicha
      titulo="Datos del caso"
      acciones={
        !ficha.fechaBaja &&
        !ficha.estado.esCierre && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setMensaje(null)
                setFalloCorreo(false)
                setEditando(true)
              }}
            >
              <Pencil aria-hidden="true" />
              Modificar datos
            </Button>
            {usuario.tipo !== 'GESTOR' && (
              <Button
                ref={botonReasignar}
                variant="outline"
                onClick={() => {
                  setMensaje(null)
                  setFalloCorreo(false)
                  setReasignando(true)
                }}
              >
                <UserRoundCheck aria-hidden="true" />
                Reasignar
              </Button>
            )}
          </div>
        )
      }
    >
      {mensaje && (
        <Aviso tipo="exito" className="mb-5">
          {mensaje}
        </Aviso>
      )}
      {falloCorreo && (
        <Aviso tipo="info" className="mb-5">
          La reasignación quedó guardada y se enviaron los avisos internos, pero no se pudo enviar
          el mail al nuevo responsable. No hace falta repetir la operación; consultá la
          configuración de correo con la administración.
        </Aviso>
      )}
      {reasignando && (
        <ReasignarSiniestroDialog
          key={ficha.id}
          ficha={ficha}
          elementoAlCerrar={() => botonReasignar.current}
          onCerrar={() => setReasignando(false)}
          onHecho={(resultado, nombre) => {
            setReasignando(false)
            setMensaje(
              `El siniestro quedó asignado a ${nombre}. El cambio se registró en el historial.`,
            )
            setFalloCorreo(!resultado.correosEnviados)
            actualizarNotificaciones()
            void revalidator.revalidate()
          }}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <BloqueFicha icono={FileText} titulo="Póliza">
          <dl className="grid gap-x-6 gap-y-4 text-lg sm:grid-cols-2">
            <Dato etiqueta="Número de siniestro">
              <span className="dato">{ficha.numeroSiniestro}</span>
            </Dato>
            <Dato etiqueta="Número de póliza">
              <span className="dato">{ficha.numeroPoliza}</span>
            </Dato>
            <Dato etiqueta="Inicio de vigencia">{ficha.inicioVigencia}</Dato>
            <Dato etiqueta="Aseguradora">{ficha.aseguradora.nombre}</Dato>
            <Dato etiqueta="Sucursal de emisión">{ficha.sucursal}</Dato>
          </dl>
        </BloqueFicha>

        <BloqueFicha
          icono={UsersRound}
          titulo="Asignación"
          className="border-assignment-border bg-assignment-bg"
        >
          <dl className="grid gap-x-6 gap-y-4 text-lg">
            <Dato etiqueta="Ajustador">{ficha.ajustador?.nombre ?? 'Sin ajustador asignado'}</Dato>
            <Dato etiqueta="Usuario asignado">{ficha.asignado.nombre}</Dato>
          </dl>
        </BloqueFicha>

        <BloqueFicha icono={Flag} titulo="El hecho">
          <dl className="grid gap-x-6 gap-y-4 text-lg sm:grid-cols-2">
            <Dato etiqueta="Fecha de ocurrencia">
              {hecho.fechaOcurrencia && <span className="dato">{dia(hecho.fechaOcurrencia)}</span>}
            </Dato>
            <Dato etiqueta="Hora de ocurrencia">
              {hecho.horaOcurrencia && <span className="dato">{hecho.horaOcurrencia} hs</span>}
            </Dato>
            <Dato etiqueta="Menor de edad involucrado" ancho>
              {hecho.menorEdadInvolucrado ? (
                <Badge variant="danger">Sí</Badge>
              ) : (
                <Badge variant="neutral">No</Badge>
              )}
            </Dato>
            <Dato etiqueta="Causa" ancho>
              {hecho.causa && <span className="whitespace-pre-line">{hecho.causa}</span>}
            </Dato>
          </dl>
        </BloqueFicha>

        <BloqueFicha icono={MapPin} titulo="Lugar del hecho">
          <dl className="grid gap-x-6 gap-y-4 text-lg sm:grid-cols-2">
            <Dato etiqueta="País">{lugar?.pais}</Dato>
            <Dato etiqueta="Provincia">{lugar?.provincia}</Dato>
            <Dato etiqueta="Localidad">{lugar?.localidad}</Dato>
            <Dato etiqueta="Calle y altura">{lugar?.calle}</Dato>
            <Dato etiqueta="Código postal">
              {lugar?.codigoPostal && <span className="dato">{lugar.codigoPostal}</span>}
            </Dato>
          </dl>
        </BloqueFicha>
      </div>
    </PestanaFicha>
  )
}
