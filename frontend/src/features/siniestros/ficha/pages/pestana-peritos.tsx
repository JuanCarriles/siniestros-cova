import { useRef, useState } from 'react'
import { useRevalidator } from 'react-router'
import {
  CalendarCheck,
  CircleDashed,
  Pencil,
  Plus,
  Stethoscope,
  Trash2,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { TipoPerito } from '@cova/shared/schemas/enums'
import type { PeritoFicha } from '@cova/shared/schemas/ficha-siniestro'
import type { PeritoAltaData } from '@cova/shared/schemas/siniestros-alta'
import { Aviso } from '@/components/aviso'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { email, telefono } from '../../components/contacto'
import { Dato } from '../../components/dato'
import { PeritoDialog } from '../../components/perito-dialog'
import { profesionales } from '../api/ficha.api'
import { BajaParteDialog, type PedidoBaja } from '../components/baja-parte-dialog'
import { PestanaFicha } from '../components/pestana-ficha'
import { fechaDe } from '../formato'
import { useFicha, usePestana } from '../hooks/use-ficha'
import { useRevision } from '../hooks/use-revision'
import { peritoAFormulario } from '../partes-formulario'

const TIPOS: Record<
  TipoPerito,
  { titulo: string; tema: string; icono: LucideIcon; nombre: string; perito: string }
> = {
  CESVI: {
    titulo: 'Perito CESVI',
    tema: 'Daños materiales del vehículo',
    icono: Wrench,
    nombre: 'un perito CESVI',
    perito: 'perito CESVI',
  },
  MEDICO: {
    titulo: 'Perito médico',
    tema: 'Lesiones de las personas',
    icono: Stethoscope,
    nombre: 'un perito médico',
    perito: 'perito médico',
  },
}

/** El modal abierto: de qué tipo, a quién modifica (null: cargar uno) y si es para registrar el cierre */
type Edicion = { tipo: TipoPerito; perito: PeritoFicha | null; registrarCierre: boolean }

// Pestaña "Peritos" (CU-10 1.e): un lugar para el CESVI y otro para el médico, con su contacto y las fechas de
// solicitud y de cierre. Sin fecha de cierre, la pericia sigue en curso (CU-09 29.a). Cargar y modificar usan el
// formulario del alta (1.e.1 y 1.e.2); "Registrar cierre" abre el mismo formulario con el foco en la fecha de cierre:
// registrarlo cuenta como movimiento del caso. Dar de baja se confirma y deja el lugar libre. Cada cambio queda en el
// historial. Un siniestro cerrado o dado de baja solo se consulta.
export function PestanaPeritos() {
  const ficha = useFicha()
  const peritos = usePestana<'peritos'>()
  const revalidator = useRevalidator()
  const editable = !ficha.fechaBaja && !ficha.estado.esCierre

  const [editando, setEditando] = useState<Edicion | null>(null)
  const [baja, setBaja] = useState<PedidoBaja | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const volverA = useRef<HTMLElement | null>(null)
  /** Después de dar de baja, el foco va al botón para cargar otro de ese tipo, que aparece en su lugar */
  const cargar = useRef<Partial<Record<TipoPerito, HTMLButtonElement | null>>>({})
  const libre = useRef<TipoPerito | null>(null)
  /** La revisión del perito que se está modificando, tal como se abrió el formulario */
  const revision = useRevision()

  const desde = (boton: HTMLElement) => {
    volverA.current = boton
    libre.current = null
    setMensaje(null)
  }
  // Después de cada cambio se vuelve a pedir la ficha: tarjetas, cantidades de las pestañas e historial al día
  const actualizar = async (texto: string) => {
    await revalidator.revalidate()
    setMensaje(texto)
  }

  async function guardar(datos: PeritoAltaData) {
    if (!editando) return
    const { tipo, perito, registrarCierre } = editando
    if (perito) {
      await revision.guardar((r) => profesionales.modificarPerito(ficha.id, perito.id, r, datos))
      await actualizar(
        registrarCierre || (!perito.cerrado && datos.cerrado)
          ? `Se registró el cierre de la pericia de ${datos.nombre}.`
          : `Se guardaron los cambios del ${TIPOS[tipo].perito} ${datos.nombre}.`,
      )
    } else {
      await profesionales.agregarPerito(ficha.id, datos)
      await actualizar(`Se cargó el ${TIPOS[tipo].perito} ${datos.nombre}.`)
    }
  }

  async function darDeBaja(pedido: PedidoBaja) {
    if (pedido.tipo !== 'perito') return
    await profesionales.darDeBajaPerito(ficha.id, pedido.perito.id)
    // El modal cierra con la pestaña ya actualizada: el botón para cargar otro ya está
    await actualizar(`Se dio de baja al ${pedido.nombreTipo} ${pedido.perito.nombre}.`)
    libre.current = pedido.perito.tipo
    setBaja(null)
  }

  return (
    <PestanaFicha titulo="Peritos del siniestro" nota="Un perito CESVI y uno médico como máximo">
      {!editable && (
        <Aviso tipo="info" className="mb-5">
          {ficha.fechaBaja
            ? 'Este siniestro está dado de baja: se puede consultar, pero no modificar.'
            : 'Este siniestro está cerrado: se puede consultar, pero no modificar.'}
        </Aviso>
      )}
      {mensaje && (
        <Aviso tipo="exito" className="mb-5">
          {mensaje}
        </Aviso>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {(Object.keys(TIPOS) as TipoPerito[]).map((tipo) => {
          const { titulo, tema, icono: Icono, nombre, perito: nombreTipo } = TIPOS[tipo]
          const delTipo = peritos.filter((p) => p.tipo === tipo)
          const encabezado = (
            <span className="flex items-center gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-info-bg text-info-ink">
                <Icono className="size-6" aria-hidden="true" />
              </span>
              <span className="grid">
                <span className="text-xl font-bold">{titulo}</span>
                <span className="font-normal text-muted-foreground">{tema}</span>
              </span>
            </span>
          )
          if (delTipo.length === 0)
            return (
              <section
                key={tipo}
                className="grid gap-4 rounded-lg border-2 border-dashed border-line-strong p-5"
              >
                <h3>{encabezado}</h3>
                <div className="grid gap-4 border-t-2 border-line pt-4">
                  <p className="flex items-center gap-2 text-lg text-muted-foreground">
                    <CircleDashed className="size-5" aria-hidden="true" />
                    Todavía no hay {nombre} cargado.
                  </p>
                  {editable && (
                    <Button
                      ref={(boton) => {
                        cargar.current[tipo] = boton
                      }}
                      variant="outline"
                      className="justify-self-start"
                      onClick={(e) => {
                        desde(e.currentTarget)
                        setEditando({ tipo, perito: null, registrarCierre: false })
                      }}
                    >
                      <Plus aria-hidden="true" />
                      Cargar {nombreTipo}
                    </Button>
                  )}
                </div>
              </section>
            )
          return delTipo.map((p) => (
            <section
              key={p.id}
              className="grid gap-4 rounded-lg border-2 border-line-strong bg-card p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3>{encabezado}</h3>
                {p.cerrado ? (
                  <Badge variant="success">Cerrada</Badge>
                ) : (
                  <Badge variant="warning">En curso</Badge>
                )}
              </div>
              <dl className="grid gap-x-6 gap-y-4 border-t-2 border-line pt-4 text-lg sm:grid-cols-2">
                <Dato etiqueta="Nombre" ancho>
                  <strong>{p.nombre}</strong>
                </Dato>
                <Dato etiqueta="Teléfono">{telefono(p.telefono)}</Dato>
                <Dato etiqueta="Email">{email(p.email)}</Dato>
                <Dato etiqueta="Fecha de solicitud">
                  <span className="dato">{fechaDe(p.fechaSolicitud)}</span>
                </Dato>
                <Dato etiqueta="Fecha de cierre">
                  {p.fechaCierre ? (
                    <span className="dato">{fechaDe(p.fechaCierre)}</span>
                  ) : (
                    'Sin cerrar'
                  )}
                </Dato>
              </dl>
              {editable && (
                <div className="flex flex-wrap gap-2 border-t-2 border-line pt-4">
                  {!p.cerrado && (
                    <Button
                      onClick={(e) => {
                        desde(e.currentTarget)
                        revision.abrir(p.revision)
                        setEditando({ tipo, perito: p, registrarCierre: true })
                      }}
                      aria-label={`Registrar el cierre de la pericia de ${p.nombre}`}
                    >
                      <CalendarCheck aria-hidden="true" />
                      Registrar cierre
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={(e) => {
                      desde(e.currentTarget)
                      revision.abrir(p.revision)
                      setEditando({ tipo, perito: p, registrarCierre: false })
                    }}
                    aria-label={`Modificar al ${nombreTipo} ${p.nombre}`}
                  >
                    <Pencil aria-hidden="true" />
                    Modificar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={(e) => {
                      desde(e.currentTarget)
                      setBaja({ tipo: 'perito', perito: p, nombreTipo })
                    }}
                    aria-label={`Dar de baja al ${nombreTipo} ${p.nombre}`}
                  >
                    <Trash2 aria-hidden="true" />
                    Dar de baja
                  </Button>
                </div>
              )}
            </section>
          ))
        })}
      </div>

      {editando && (
        <PeritoDialog
          key={`${editando.tipo}-${editando.perito?.id ?? 'nuevo'}-${editando.registrarCierre}`}
          tipo={editando.tipo}
          perito={editando.perito && peritoAFormulario(editando.perito)}
          registrarCierre={editando.registrarCierre}
          onGuardar={guardar}
          onCerrar={() => setEditando(null)}
          elementoAlCerrar={() => volverA.current}
        />
      )}
      <BajaParteDialog
        pedido={baja}
        onConfirmar={darDeBaja}
        onCerrar={() => setBaja(null)}
        elementoAlCerrar={() => (libre.current && cargar.current[libre.current]) || volverA.current}
      />
    </PestanaFicha>
  )
}
