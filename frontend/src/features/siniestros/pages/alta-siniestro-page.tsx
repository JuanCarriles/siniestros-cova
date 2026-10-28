import { useCallback, useRef, useState } from 'react'
import { Link, useLoaderData, useNavigate } from 'react-router'
import { ArrowRight, ChevronLeft, CircleCheck, Pencil } from 'lucide-react'
import { MENSAJE_ASIGNACION_OBLIGATORIA } from '@cova/shared/schemas/siniestros-alta'
import { ApiError } from '@/lib/api'
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
  type BorradorAlta,
  type DatosCasoFormulario,
} from '../borrador-alta'
import { limpiarRepresentados } from '../abogados-alta'
import { crearSiniestro, quitarDocumentoAlta } from '../api/siniestros.api'
import { AbogadosAlta } from '../components/abogados-alta'
import { AsignacionAlta } from '../components/asignacion-alta'
import { DatosCasoForm } from '../components/datos-caso-form'
import { DocumentosAlta } from '../components/documentos-alta'
import { PasosAlta } from '../components/pasos-alta'
import { PeritosAlta } from '../components/peritos-alta'
import { PersonasExternasAlta } from '../components/personas-externas-alta'
import { VehiculosAlta } from '../components/vehiculos-alta'
import { armarAlta, type EstadoAltaCreada } from '../crear-alta'
import type { cargarAltaSiniestro } from '../loader'

/** Todo lo del alta salvo el paso 1, que vive en su formulario */
type Partes = Omit<BorradorAlta, 'version' | 'paso' | 'guardado' | 'datosCaso'>

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

// CU-09: alta de siniestro en cinco pasos (E4-04 datos del caso; E4-05 a E4-07 vehículos y personas; E4-08
// abogados; E4-09 peritos; E4-10 documentos y asignación). Lo cargado se guarda en este navegador a medida que se
// escribe; el siniestro recién se crea al confirmar el último paso.
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
  // Lo de los pasos 2 a 5. La ref tiene siempre lo último (dos cambios seguidos no se pisan); el estado, lo que
  // se muestra.
  const [partes, setPartes] = useState<Partes>(() => ({
    vehiculos: inicial?.vehiculos ?? [],
    personasExternas: inicial?.personasExternas ?? [],
    abogados: inicial?.abogados ?? [],
    peritos: inicial?.peritos ?? [],
    documentos: inicial?.documentos ?? [],
    idUsuarioAsignado: inicial?.idUsuarioAsignado ?? null,
  }))
  const actuales = useRef(partes)
  const pasoActual = useRef(paso)
  const { vehiculos, personasExternas, abogados, peritos, documentos, idUsuarioAsignado } = partes
  const involucrados = { vehiculos, personasExternas }
  const [faltanRepresentados, setFaltanRepresentados] = useState(false)
  const [faltaAsignar, setFaltaAsignar] = useState(false)
  const [creando, setCreando] = useState(false)
  // Documentos que se están cargando o quitando: mientras haya alguno, no se crea el siniestro
  const [documentosPendientes, setDocumentosPendientes] = useState(0)
  const [errorCrear, setErrorCrear] = useState<string | null>(null)
  const grupoAsignacion = useRef<HTMLFieldSetElement>(null)

  const guardar = useCallback(
    () =>
      guardarBorrador(idUsuario, {
        paso: pasoActual.current,
        datosCaso: ultimos.current,
        ...actuales.current,
      }),
    [idUsuario],
  )
  const alCambiar = useCallback(
    (valores: DatosCasoFormulario) => {
      ultimos.current = valores
      guardar()
    },
    [guardar],
  )
  function cambiar(cambio: Partial<Partes>) {
    const nuevas = { ...actuales.current, ...cambio }
    // Si se quita a una persona del paso 2, deja de figurar en su abogado
    if (cambio.vehiculos || cambio.personasExternas)
      nuevas.abogados = limpiarRepresentados(nuevas.abogados, nuevas)
    actuales.current = nuevas
    setPartes(nuevas)
    guardar()
  }
  function irAlPaso(numero: number) {
    setDatosCaso(ultimos.current)
    setPaso(numero)
    pasoActual.current = numero
    setFaltanRepresentados(false)
    setFaltaAsignar(false)
    setErrorCrear(null)
    guardar()
    window.scrollTo({ top: 0 })
  }
  function descartar() {
    // Los documentos ya subidos se borran de R2: el alta no se va a crear. Si alguno falla, queda en la
    // carpeta del alta (no se ve en ningún siniestro).
    void Promise.allSettled(documentos.map((d) => quitarDocumentoAlta(d.clave)))
    borrarBorrador(idUsuario)
    void navigate(`${basePath}/siniestros`, { replace: true })
  }
  // Paso 36: crea el siniestro con todo lo cargado y vuelve al listado con el aviso
  async function crear() {
    setErrorCrear(null)
    if (documentosPendientes > 0)
      return setErrorCrear(
        'Esperá a que terminen de cargarse o quitarse los documentos antes de crear el siniestro.',
      )
    if (!idUsuarioAsignado) {
      setFaltaAsignar(true)
      grupoAsignacion.current?.focus()
      return
    }
    if (abogados.some((a) => a.representados.length === 0))
      return setErrorCrear(
        'Hay abogados sin personas a las que representan. Corregilo en el paso 3 antes de crear el siniestro.',
      )
    setCreando(true)
    try {
      // Lo último guardado, no lo de este render: un documento pudo terminar de cargarse recién
      const creado = await crearSiniestro(
        armarAlta({ datosCaso: ultimos.current, ...actuales.current }),
      )
      borrarBorrador(idUsuario)
      void navigate(`${basePath}/siniestros`, {
        replace: true,
        state: { altaCreada: creado } satisfies EstadoAltaCreada,
      })
    } catch (err) {
      setErrorCrear(
        err instanceof ApiError
          ? err.message
          : 'No se pudo crear el siniestro. Revisá la conexión y probá de nuevo: lo cargado no se pierde.',
      )
      setCreando(false)
    }
  }

  const cancelar = (
    <Button
      type="button"
      variant="outline"
      size="lg"
      disabled={creando}
      onClick={() => setCancelando(true)}
    >
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
            personasExternas={personasExternas}
            onCambiar={(nuevos) => cambiar({ vehiculos: nuevos })}
            opciones={opciones}
            idAseguradoraSiniestro={String(datosCaso.idAseguradora ?? '')}
          />
          <PersonasExternasAlta
            personas={personasExternas}
            onCambiar={(nuevas) => cambiar({ personasExternas: nuevas })}
            vehiculos={vehiculos}
            opciones={opciones}
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
      ) : paso === 3 ? (
        <section className="grid gap-6">
          <ResumenCaso
            numero={String(datosCaso.numeroSiniestro)}
            aseguradora={
              opciones.aseguradoras.find((a) => String(a.id) === String(datosCaso.idAseguradora))
                ?.nombre
            }
            onModificar={() => irAlPaso(1)}
          />
          {faltanRepresentados && (
            <Aviso tipo="error" enfocar>
              Hay abogados sin personas a las que representan. Elegí a quién representa cada uno o
              quitalos para continuar.
            </Aviso>
          )}
          <AbogadosAlta
            abogados={abogados}
            onCambiar={(nuevos) => {
              setFaltanRepresentados(false)
              cambiar({ abogados: nuevos })
            }}
            involucrados={involucrados}
          />
          <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid gap-3 sm:flex sm:flex-wrap">
              {cancelar}
              <Button type="button" size="lg" variant="outline" onClick={() => irAlPaso(2)}>
                Volver a vehículos y personas
              </Button>
            </div>
            <Button
              type="button"
              size="lg"
              onClick={() =>
                abogados.some((a) => a.representados.length === 0)
                  ? setFaltanRepresentados(true)
                  : irAlPaso(4)
              }
            >
              Continuar
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </section>
      ) : paso === 4 ? (
        <section className="grid gap-6">
          <ResumenCaso
            numero={String(datosCaso.numeroSiniestro)}
            aseguradora={
              opciones.aseguradoras.find((a) => String(a.id) === String(datosCaso.idAseguradora))
                ?.nombre
            }
            onModificar={() => irAlPaso(1)}
          />
          <PeritosAlta peritos={peritos} onCambiar={(nuevos) => cambiar({ peritos: nuevos })} />
          <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid gap-3 sm:flex sm:flex-wrap">
              {cancelar}
              <Button type="button" size="lg" variant="outline" onClick={() => irAlPaso(3)}>
                Volver a abogados
              </Button>
            </div>
            <Button type="button" size="lg" onClick={() => irAlPaso(5)}>
              Continuar
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </section>
      ) : (
        // Mientras se crea el siniestro, nada lo puede cambiar: el fieldset deshabilita todos los controles
        <fieldset disabled={creando} className="grid min-w-0 gap-6">
          <ResumenCaso
            numero={String(datosCaso.numeroSiniestro)}
            aseguradora={
              opciones.aseguradoras.find((a) => String(a.id) === String(datosCaso.idAseguradora))
                ?.nombre
            }
            onModificar={() => irAlPaso(1)}
          />
          <DocumentosAlta
            documentos={documentos}
            onCambiar={(cambio) => cambiar({ documentos: cambio(actuales.current.documentos) })}
            onPendientes={(cambio) => setDocumentosPendientes((n) => n + cambio)}
            bloqueado={creando}
          />
          <AsignacionAlta
            usuarios={opciones.usuarios}
            valor={idUsuarioAsignado}
            onCambiar={(id) => {
              setFaltaAsignar(false)
              cambiar({ idUsuarioAsignado: id })
            }}
            error={faltaAsignar ? MENSAJE_ASIGNACION_OBLIGATORIA : null}
            grupoRef={grupoAsignacion}
          />
          {errorCrear && (
            <Aviso tipo="error" enfocar>
              {errorCrear}
            </Aviso>
          )}
          <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid gap-3 sm:flex sm:flex-wrap">
              {cancelar}
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={creando}
                onClick={() => irAlPaso(4)}
              >
                Volver a peritos
              </Button>
            </div>
            <Button type="button" size="lg" loading={creando} onClick={() => void crear()}>
              <CircleCheck aria-hidden="true" />
              {creando ? 'Creando siniestro…' : 'Crear siniestro'}
            </Button>
          </div>
        </fieldset>
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
