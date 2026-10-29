import { FileText, Flag, MapPin, UsersRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Dato } from '../../components/dato'
import { BloqueFicha, PestanaFicha } from '../components/pestana-ficha'
import { dia } from '../formato'
import { useFicha } from '../hooks/use-ficha'

// Pestaña "Datos del caso" (CU-10 paso 1): póliza, asignación, el hecho y dónde pasó. Llega con la cabecera.
export function PestanaDatosCaso() {
  const ficha = useFicha()
  const { hecho, lugar } = ficha
  return (
    <PestanaFicha titulo="Datos del caso">
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
