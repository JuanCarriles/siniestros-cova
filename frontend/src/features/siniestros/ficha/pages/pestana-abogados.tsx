import { useRef, useState } from 'react'
import { Link, useRevalidator } from 'react-router'
import { Gavel, Pencil, Plus, Trash2 } from 'lucide-react'
import type { AbogadoFicha } from '@cova/shared/schemas/ficha-siniestro'
import type { AbogadoAltaData } from '@cova/shared/schemas/siniestros-alta'
import { Aviso } from '@/components/aviso'
import { Button } from '@/components/ui/button'
import { gruposRepresentables } from '../../abogados-alta'
import { AbogadoDialog } from '../../components/abogado-dialog'
import { email, telefono } from '../../components/contacto'
import { Dato } from '../../components/dato'
import { nombresPersonas } from '../../personas-alta'
import { profesionales } from '../api/ficha.api'
import { BajaParteDialog, type PedidoBaja } from '../components/baja-parte-dialog'
import { PestanaFicha, PestanaVacia } from '../components/pestana-ficha'
import { nombreDe } from '../formato'
import { useFicha, usePestana } from '../hooks/use-ficha'
import {
  abogadoAFormulario,
  idDePersona,
  personasDelSiniestro,
  representablesDeFicha,
  representantesDeFicha,
} from '../partes-formulario'

// Pestaña "Abogados" (CU-10 1.d): cada abogado con sus datos de contacto y las personas que representa. Agregar y
// modificar usan el formulario del alta (1.d.1 y 1.d.2), con las personas guardadas del siniestro; dar de baja se
// confirma y sus representados quedan sin abogado. Cada cambio queda en el historial. Un siniestro cerrado o dado de
// baja solo se consulta.
export function PestanaAbogados() {
  const ficha = useFicha()
  const { abogados, personas } = usePestana<'abogados'>()
  const revalidator = useRevalidator()
  const editable = !ficha.fechaBaja && !ficha.estado.esCierre

  /** undefined: cerrado; null: agregar uno nuevo */
  const [editando, setEditando] = useState<AbogadoFicha | null | undefined>()
  const [baja, setBaja] = useState<PedidoBaja | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const volverA = useRef<HTMLElement | null>(null)
  const agregar = useRef<HTMLButtonElement>(null)

  const grupos = gruposRepresentables(
    representablesDeFicha(personas),
    nombresPersonas(personasDelSiniestro(personas)),
  )
  const hayPersonas = grupos.length > 0

  const desde = (boton: HTMLElement) => {
    volverA.current = boton
    setMensaje(null)
  }
  // Después de cada cambio se vuelve a pedir la ficha: tarjetas, cantidades de las pestañas e historial al día
  const actualizar = async (texto: string) => {
    await revalidator.revalidate()
    setMensaje(texto)
  }

  async function guardar(datos: AbogadoAltaData) {
    const pedido = { ...datos, representados: datos.representados.map(idDePersona) }
    if (editando) {
      await profesionales.modificarAbogado(ficha.id, editando.id, pedido)
      await actualizar(`Se guardaron los cambios del abogado ${datos.nombreCompleto}.`)
    } else {
      await profesionales.agregarAbogado(ficha.id, pedido)
      await actualizar(`Se agregó el abogado ${datos.nombreCompleto}.`)
    }
  }

  async function darDeBaja(pedido: PedidoBaja) {
    if (pedido.tipo !== 'abogado') return
    await profesionales.darDeBajaAbogado(ficha.id, pedido.abogado.id)
    volverA.current = agregar.current
    setBaja(null)
    await actualizar(`Se dio de baja al abogado ${pedido.abogado.nombreCompleto}.`)
  }

  return (
    <PestanaFicha
      titulo="Abogados de terceros"
      cantidad={abogados.length}
      acciones={
        editable &&
        hayPersonas && (
          <Button
            ref={agregar}
            variant="outline"
            onClick={(e) => {
              desde(e.currentTarget)
              setEditando(null)
            }}
          >
            <Plus aria-hidden="true" />
            Agregar abogado
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

      {abogados.length === 0 ? (
        <PestanaVacia icono={Gavel}>
          Ninguna persona del siniestro tiene abogado cargado.
          {editable && !hayPersonas && (
            <>
              {' '}
              Para cargar uno, primero agregá a la persona que representa en{' '}
              <Link to="../vehiculos" className="font-semibold text-primary underline">
                Vehículos y partes
              </Link>
              .
            </>
          )}
        </PestanaVacia>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {abogados.map((a) => (
            <li key={a.id}>
              <article className="grid gap-4 rounded-lg border-2 border-line-strong bg-card p-5">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <p className="flex items-center gap-2 text-sm font-bold tracking-wider text-muted-foreground uppercase">
                      <Gavel className="size-4" aria-hidden="true" />
                      Abogado
                    </p>
                    <h3 className="text-xl font-bold">{a.nombreCompleto}</h3>
                  </div>
                  {editable && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={(e) => {
                          desde(e.currentTarget)
                          setEditando(a)
                        }}
                        aria-label={`Modificar al abogado ${a.nombreCompleto}`}
                      >
                        <Pencil aria-hidden="true" />
                        Modificar
                      </Button>
                      <Button
                        variant="outline"
                        onClick={(e) => {
                          desde(e.currentTarget)
                          setBaja({ tipo: 'abogado', abogado: a })
                        }}
                        aria-label={`Dar de baja al abogado ${a.nombreCompleto}`}
                      >
                        <Trash2 aria-hidden="true" />
                        Dar de baja
                      </Button>
                    </div>
                  )}
                </header>
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Dato etiqueta="Matrícula">
                    {a.numeroMatricula && <span className="dato">{a.numeroMatricula}</span>}
                  </Dato>
                  <Dato etiqueta="Teléfono">{telefono(a.telefono)}</Dato>
                  <Dato etiqueta="Email" ancho>
                    {email(a.email)}
                  </Dato>
                  <Dato etiqueta="Representa a" ancho>
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {a.representa.map((p) => (
                        <li
                          key={p.id}
                          className="rounded-md bg-neutral-bg px-3 py-1 font-semibold text-neutral-ink"
                        >
                          {nombreDe(p)}
                        </li>
                      ))}
                    </ul>
                  </Dato>
                </dl>
              </article>
            </li>
          ))}
        </ul>
      )}

      {editando !== undefined && (
        <AbogadoDialog
          key={editando?.id ?? 'nuevo'}
          abogado={editando && abogadoAFormulario(editando)}
          grupos={grupos}
          representantes={representantesDeFicha(personas)}
          onGuardar={guardar}
          onCerrar={() => setEditando(undefined)}
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
