import { useRef, useState } from 'react'
import { useRevalidator } from 'react-router'
import { Car, Plus, UserPlus, UsersRound } from 'lucide-react'
import type { VehiculoFicha } from '@cova/shared/schemas/ficha-siniestro'
import type {
  OcupanteAltaData,
  PersonaExternaAltaData,
  TitularAltaData,
  VehiculoAltaData,
} from '@cova/shared/schemas/siniestros-alta'
import { Aviso } from '@/components/aviso'
import { Button } from '@/components/ui/button'
import { PersonaDialog, type ModoPersona } from '../../components/persona-dialog'
import { VehiculoDialog } from '../../components/vehiculo-dialog'
import { partes } from '../api/ficha.api'
import { BajaParteDialog, type PedidoBaja } from '../components/baja-parte-dialog'
import { PestanaFicha, PestanaVacia } from '../components/pestana-ficha'
import {
  DetallePersonaDialog,
  TarjetaPersonaFicha,
  type PersonaEnFicha,
} from '../components/persona-ficha'
import { DetalleVehiculoDialog, TarjetaVehiculo } from '../components/vehiculo-ficha'
import { nombreDe, tituloVehiculo } from '../formato'
import { useFicha, usePestana } from '../hooks/use-ficha'
import { useRevision } from '../hooks/use-revision'
import {
  aseguradorasPara,
  externaAFormulario,
  ocupanteAFormulario,
  opcionesPara,
  personasDelSiniestro,
  titularAFormulario,
  vehiculoAFormulario,
} from '../partes-formulario'

type PersonaData = TitularAltaData | OcupanteAltaData | PersonaExternaAltaData
/** El modal de persona abierto: dónde va (modo y vehículo) y, al modificar, quién es */
type EdicionPersona = {
  modo: ModoPersona
  vehiculo: VehiculoFicha | null
  persona: PersonaEnFicha | null
}

function personaAFormulario(p: PersonaEnFicha) {
  if (p.tipo === 'fuera') return externaAFormulario(p.persona)
  return p.tipo === 'titular' ? titularAFormulario(p.persona) : ocupanteAFormulario(p.persona)
}

// Pestaña "Vehículos y partes" (CU-10 1.c): cada vehículo con su titular y sus ocupantes, y aparte las personas que
// no iban en ninguno. "Ver detalle" muestra todos los datos (1.c.7 a 1.c.10). Agregar y modificar usan los mismos
// formularios del alta (1.c.1 a 1.c.5); dar de baja se confirma (1.c.6). Cada cambio queda en el historial. Un
// siniestro cerrado o dado de baja solo se consulta. Si otro usuario modificó el mismo registro mientras el formulario
// estaba abierto, el guardado se rechaza y avisa; guardar de nuevo después del aviso reemplaza esos cambios.
export function PestanaVehiculos() {
  const ficha = useFicha()
  const datos = usePestana<'vehiculos'>()
  const { vehiculos, personasFuera, opciones } = datos
  const revalidator = useRevalidator()
  const editable = !ficha.fechaBaja && !ficha.estado.esCierre

  const [vehiculo, setVehiculo] = useState<VehiculoFicha | null>(null)
  const [persona, setPersona] = useState<PersonaEnFicha | null>(null)
  /** undefined: cerrado; null: agregar uno nuevo */
  const [editandoVehiculo, setEditandoVehiculo] = useState<VehiculoFicha | null | undefined>()
  const [editandoPersona, setEditandoPersona] = useState<EdicionPersona | null>(null)
  const [baja, setBaja] = useState<PedidoBaja | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const volverA = useRef<HTMLElement | null>(null)
  const agregarVehiculo = useRef<HTMLButtonElement>(null)
  /** La revisión del vehículo o la persona que se está modificando, tal como se abrió el formulario */
  const revision = useRevision()

  // El asegurado viene primero; los terceros se numeran en orden de carga
  let terceros = 0
  const titulos = new Map(
    vehiculos.map((v) => [v.id, tituloVehiculo(v, v.rolAccidente === 'TERCERO' ? ++terceros : 0)]),
  )
  const desde = (boton: HTMLElement) => {
    volverA.current = boton
    setMensaje(null)
  }
  const verPersona = (p: PersonaEnFicha, boton: HTMLElement) => {
    desde(boton)
    setPersona(p)
  }
  // Después de cada cambio se vuelve a pedir la ficha: tarjetas, cantidades de las pestañas e historial al día
  const actualizar = async (texto: string) => {
    await revalidator.revalidate()
    setMensaje(texto)
  }

  async function guardarVehiculo(nuevos: VehiculoAltaData) {
    if (editandoVehiculo) {
      await revision.guardar((r) =>
        partes.modificarVehiculo(ficha.id, editandoVehiculo.id, r, nuevos),
      )
      await actualizar(`Se guardaron los cambios del vehículo ${nuevos.dominio}.`)
    } else {
      await partes.agregarVehiculo(ficha.id, nuevos)
      await actualizar(`Se agregó el vehículo ${nuevos.dominio}.`)
    }
  }

  async function guardarPersona(nuevos: PersonaData) {
    if (!editandoPersona) return
    const { modo, vehiculo: suyo, persona: actual } = editandoPersona
    const nombre = nuevos.nombreCompletoRazonSocial || 'la persona'
    if (actual) {
      await revision.guardar((r) => partes.modificarPersona(ficha.id, actual.persona.id, r, nuevos))
      return actualizar(`Se guardaron los cambios de ${nombre}.`)
    }
    if (modo === 'externa')
      await partes.agregarPersona(ficha.id, {
        tipo: 'externa',
        datos: nuevos as PersonaExternaAltaData,
      })
    else if (suyo)
      await partes.agregarPersona(
        ficha.id,
        modo === 'titular'
          ? { tipo: 'titular', idVehiculo: suyo.id, datos: nuevos as TitularAltaData }
          : { tipo: 'ocupante', idVehiculo: suyo.id, datos: nuevos as OcupanteAltaData },
      )
    await actualizar(
      modo === 'externa'
        ? `Se agregó a ${nombre}.`
        : `Se agregó a ${nombre} como ${modo} del vehículo ${suyo?.dominio ?? ''}.`,
    )
  }

  async function darDeBaja(pedido: PedidoBaja) {
    if (pedido.tipo === 'vehiculo') {
      await partes.darDeBajaVehiculo(ficha.id, pedido.vehiculo.id)
      volverA.current = agregarVehiculo.current
      setBaja(null)
      await actualizar(`Se dio de baja el vehículo ${pedido.vehiculo.dominio}.`)
    } else if (pedido.tipo === 'persona') {
      await partes.darDeBajaPersona(ficha.id, pedido.persona.persona.id)
      volverA.current = agregarVehiculo.current
      setBaja(null)
      await actualizar(`Se dio de baja a ${nombreDe(pedido.persona.persona)}.`)
    }
  }

  /** suyo: el vehículo donde está la persona (null si no iba en ninguno) */
  const accionesPersona = (p: PersonaEnFicha, suyo: VehiculoFicha | null) => ({
    onModificar: (boton: HTMLElement) => {
      desde(boton)
      revision.abrir(p.persona.revision)
      setEditandoPersona({
        modo: p.tipo === 'fuera' ? 'externa' : p.tipo,
        vehiculo: suyo,
        persona: p,
      })
    },
    onDarDeBaja: (boton: HTMLElement) => {
      desde(boton)
      setBaja({ tipo: 'persona', persona: p })
    },
  })

  const vacio = vehiculos.length === 0 && personasFuera.length === 0
  return (
    <PestanaFicha
      titulo="Partes involucradas"
      acciones={
        editable && (
          <Button
            ref={agregarVehiculo}
            variant="outline"
            onClick={(e) => {
              desde(e.currentTarget)
              setEditandoVehiculo(null)
            }}
          >
            <Plus aria-hidden="true" />
            Agregar vehículo
          </Button>
        )
      }
    >
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

      {vacio && !editable ? (
        <PestanaVacia icono={Car}>
          Este siniestro no tiene vehículos ni personas cargadas.
        </PestanaVacia>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          {vehiculos.map((v) => (
            <TarjetaVehiculo
              key={v.id}
              vehiculo={v}
              titulo={titulos.get(v.id) ?? ''}
              onVerVehiculo={(boton) => {
                desde(boton)
                setVehiculo(v)
              }}
              onVerPersona={verPersona}
              acciones={
                editable
                  ? {
                      onModificar: (boton) => {
                        desde(boton)
                        revision.abrir(v.revision)
                        setEditandoVehiculo(v)
                      },
                      onDarDeBaja: (boton) => {
                        desde(boton)
                        setBaja({ tipo: 'vehiculo', vehiculo: v })
                      },
                      onAgregarPersona: (modo, boton) => {
                        desde(boton)
                        setEditandoPersona({ modo, vehiculo: v, persona: null })
                      },
                      onModificarPersona: (p, boton) => accionesPersona(p, v).onModificar(boton),
                      onDarDeBajaPersona: (p, boton) => accionesPersona(p, v).onDarDeBaja(boton),
                    }
                  : undefined
              }
            />
          ))}

          <section
            aria-labelledby="personas-fuera"
            className="overflow-hidden rounded-xl border-2 border-line-strong bg-surface-subtle shadow-card"
          >
            <h3
              id="personas-fuera"
              className="flex items-center gap-2.5 border-b-2 border-line-strong bg-table-head px-5 py-4 text-xl font-bold text-table-head-foreground"
            >
              <UsersRound className="size-6 shrink-0" aria-hidden="true" />
              Peatones, testigos, dueños de propiedad, etc.
            </h3>
            <div className="grid gap-3 p-4">
              {personasFuera.map((p) => {
                const enFicha: PersonaEnFicha = { tipo: 'fuera', persona: p, rol: 'Tercero' }
                return (
                  <TarjetaPersonaFicha
                    key={p.id}
                    persona={enFicha}
                    onVerDetalle={(boton) => verPersona(enFicha, boton)}
                    acciones={editable ? accionesPersona(enFicha, null) : undefined}
                  />
                )
              })}
              {personasFuera.length === 0 && (
                <p className="text-muted-foreground">
                  No hay personas fuera de los vehículos cargadas.
                </p>
              )}
              {editable && (
                <Button
                  variant="outline"
                  className="justify-self-start"
                  onClick={(e) => {
                    desde(e.currentTarget)
                    setEditandoPersona({ modo: 'externa', vehiculo: null, persona: null })
                  }}
                >
                  <UserPlus aria-hidden="true" />
                  Agregar persona
                </Button>
              )}
            </div>
          </section>
        </div>
      )}

      <DetalleVehiculoDialog
        vehiculo={vehiculo}
        titulos={titulos}
        onCerrar={() => setVehiculo(null)}
        elementoAlCerrar={() => volverA.current}
      />
      <DetallePersonaDialog
        persona={persona}
        onCerrar={() => setPersona(null)}
        elementoAlCerrar={() => volverA.current}
      />

      {editandoVehiculo !== undefined && (
        <VehiculoDialog
          key={editandoVehiculo?.id ?? 'nuevo'}
          vehiculo={editandoVehiculo && vehiculoAFormulario(editandoVehiculo)}
          otros={vehiculos
            .filter((v) => v.id !== editandoVehiculo?.id)
            .map((v) => ({ dominio: v.dominio, rolAccidente: v.rolAccidente ?? 'TERCERO' }))}
          aseguradoras={aseguradorasPara(opciones.aseguradoras, editandoVehiculo ?? null)}
          idAseguradoraSiniestro={String(ficha.aseguradora.id)}
          onGuardar={guardarVehiculo}
          onCerrar={() => setEditandoVehiculo(undefined)}
          elementoAlCerrar={() => volverA.current}
        />
      )}
      {editandoPersona && (
        <PersonaDialog
          key={`${editandoPersona.modo}-${editandoPersona.persona?.persona.id ?? 'nueva'}`}
          modo={editandoPersona.modo}
          vehiculo={editandoPersona.vehiculo}
          persona={editandoPersona.persona && personaAFormulario(editandoPersona.persona)}
          involucrados={personasDelSiniestro(datos)}
          opciones={opcionesPara(opciones, editandoPersona.persona?.persona ?? null)}
          onGuardar={guardarPersona}
          onCerrar={() => setEditandoPersona(null)}
          elementoAlCerrar={() => volverA.current}
        />
      )}
      <BajaParteDialog
        pedido={baja}
        onConfirmar={darDeBaja}
        onCerrar={() => setBaja(null)}
        elementoAlCerrar={() => volverA.current}
      />
    </PestanaFicha>
  )
}
