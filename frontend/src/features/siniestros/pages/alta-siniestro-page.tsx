import { useCallback, useRef, useState } from 'react'
import { Link, useLoaderData, useNavigate } from 'react-router'
import { ArrowRight, ChevronLeft, Construction, Pencil } from 'lucide-react'
import { PASOS_ALTA } from '@cova/shared/schemas/siniestros-alta'
import { Aviso } from '@/components/aviso'
import { usePanel } from '@/components/layout/panel-context'
import { SectionHeading } from '@/components/layout/section-heading'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  borrarBorrador,
  datosCasoVacios,
  guardarBorrador,
  leerBorrador,
  type DatosCasoFormulario,
  type VehiculoBorrador,
} from '../borrador-alta'
import { DatosCasoForm } from '../components/datos-caso-form'
import { PasosAlta } from '../components/pasos-alta'
import { VehiculosAlta } from '../components/vehiculos-alta'
import type { cargarAltaSiniestro } from '../loader'

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

// CU-09: alta de siniestro en cinco pasos (E4-04 el primero; E4-05 los vehículos del segundo). Lo cargado se guarda en este navegador a
// medida que se escribe; el siniestro recién se crea al confirmar el último paso.
export function AltaSiniestroPage() {
  const { idUsuario, opciones } = useLoaderData<typeof cargarAltaSiniestro>()
  const { basePath } = usePanel()
  const navigate = useNavigate()
  // Se lee una sola vez, al entrar: de ahí en adelante manda lo que se escribe
  const [inicial] = useState(() => leerBorrador(idUsuario))
  const [paso, setPaso] = useState(inicial?.paso ?? 1)
  const [cancelando, setCancelando] = useState(false)
  // Lo que se muestra al entrar a un paso. Mientras se escribe, lo último vive en la ref y en el borrador.
  const [datosCaso, setDatosCaso] = useState<DatosCasoFormulario>(() =>
    inicial
      ? {
          ...datosCasoVacios,
          ...inicial.datosCaso,
          lugar: { ...datosCasoVacios.lugar, ...inicial.datosCaso.lugar },
        }
      : {
          ...datosCasoVacios,
          pais: opciones.paises.length === 1 ? String(opciones.paises[0].id) : '',
        },
  )
  const ultimos = useRef(datosCaso)
  const [vehiculos, setVehiculos] = useState<VehiculoBorrador[]>(inicial?.vehiculos ?? [])

  const alCambiar = useCallback(
    (valores: DatosCasoFormulario) => {
      ultimos.current = valores
      guardarBorrador(idUsuario, { paso: 1, datosCaso: valores, vehiculos })
    },
    [idUsuario, vehiculos],
  )
  function cambiarVehiculos(nuevos: VehiculoBorrador[]) {
    setVehiculos(nuevos)
    guardarBorrador(idUsuario, { paso, datosCaso: ultimos.current, vehiculos: nuevos })
  }
  function irAlPaso(numero: number) {
    setDatosCaso(ultimos.current)
    setPaso(numero)
    guardarBorrador(idUsuario, { paso: numero, datosCaso: ultimos.current, vehiculos })
    window.scrollTo({ top: 0 })
  }
  function descartar() {
    borrarBorrador(idUsuario)
    void navigate(`${basePath}/siniestros`, { replace: true })
  }

  const cancelar = (
    <Button type="button" variant="outline" size="lg" onClick={() => setCancelando(true)}>
      Cancelar alta
    </Button>
  )

  return (
    <>
      <Button asChild variant="link" className="mb-3 px-0">
        <Link to={`${basePath}/siniestros`}>
          <ChevronLeft aria-hidden="true" /> Volver al listado
        </Link>
      </Button>
      <SectionHeading
        section="siniestros"
        titulo="Nuevo siniestro"
        descripcion="Cargá los datos que tengas: solo el número de siniestro, la póliza, la aseguradora y la sucursal son obligatorios. Lo que escribas se guarda en este navegador hasta que confirmes el alta."
      />

      {inicial && (
        <Aviso tipo="info" className="mb-6">
          Retomaste el alta que dejaste a medias el {fechaHora(inicial.guardado)}. Si querés empezar
          de cero, usá «Cancelar alta».
        </Aviso>
      )}

      <PasosAlta actual={paso} />

      {paso === 1 ? (
        <DatosCasoForm
          opciones={opciones}
          valoresIniciales={datosCaso}
          onCambio={alCambiar}
          onContinuar={(validados) => {
            ultimos.current = validados
            irAlPaso(2)
          }}
          acciones={cancelar}
        />
      ) : paso === 2 ? (
        <section className="grid gap-6">
          <ResumenCaso
            numero={String(datosCaso.numeroSiniestro)}
            aseguradora={
              opciones.aseguradoras.find((a) => String(a.id) === String(datosCaso.idAseguradora))
                ?.nombre
            }
            onModificar={() => irAlPaso(1)}
          />
          <VehiculosAlta
            vehiculos={vehiculos}
            onCambiar={cambiarVehiculos}
            opciones={opciones}
            idAseguradoraSiniestro={String(datosCaso.idAseguradora ?? '')}
          />
          <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid gap-3 sm:flex sm:flex-wrap">
              {cancelar}
              <Button type="button" size="lg" variant="outline" onClick={() => irAlPaso(1)}>
                Volver a datos del caso
              </Button>
            </div>
            <Button type="button" size="lg" onClick={() => irAlPaso(3)}>
              Continuar
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </section>
      ) : (
        <section className="grid gap-6">
          <div className="flex flex-wrap items-center gap-6 rounded-xl border bg-card px-6 py-10 shadow-card sm:px-10">
            <span
              className="grid size-16 place-items-center rounded-2xl bg-callout-bg text-primary"
              aria-hidden="true"
            >
              <Construction className="size-8" />
            </span>
            <p className="max-w-xl text-muted-foreground">
              El paso «{PASOS_ALTA[paso - 1]}» todavía está en construcción. Lo cargado queda
              guardado en este navegador: podés volver a esta pantalla cuando esté disponible.
            </p>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-between">
            {cancelar}
            <Button type="button" size="lg" variant="outline" onClick={() => irAlPaso(paso - 1)}>
              Volver a {PASOS_ALTA[paso - 2].toLowerCase()}
            </Button>
          </div>
        </section>
      )}

      <Dialog open={cancelando} onOpenChange={setCancelando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cancelar el alta?</DialogTitle>
            <DialogDescription>
              Se descarta todo lo que cargaste para este siniestro. No se crea ningún siniestro y no
              se puede recuperar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Seguir cargando</Button>
            </DialogClose>
            <Button variant="destructive" onClick={descartar}>
              Descartar alta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Recuerda de qué siniestro se trata mientras se cargan los pasos siguientes
function ResumenCaso({
  numero,
  aseguradora,
  onModificar,
}: {
  numero: string
  aseguradora: string | undefined
  onModificar: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4 shadow-card sm:px-6">
      <p className="text-lg">
        <span className="text-muted-foreground">Siniestro </span>
        <span className="dato font-bold">{numero}</span>
        <span className="text-muted-foreground"> · {aseguradora ?? 'Aseguradora'}</span>
      </p>
      <Button type="button" variant="link" className="px-0" onClick={onModificar}>
        <Pencil aria-hidden="true" />
        Modificar datos del caso
      </Button>
    </div>
  )
}
