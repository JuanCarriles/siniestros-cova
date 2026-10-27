import { useRef, useState, type ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus } from 'lucide-react'
import type { TipoLesion } from '@cova/shared/schemas/enums'
import {
  CONDUCTOR,
  ESTADOS_CIVILES,
  GRAVEDADES_LESION,
  LUGARES_EN_VEHICULO,
  SEXOS,
  hoyArgentina,
  ocupanteAltaSchema,
  titularAltaSchema,
  type OcupanteAltaData,
  type OcupanteAltaInput,
  type OpcionesAltaSiniestro,
  type TitularAltaData,
  type TitularAltaInput,
} from '@cova/shared/schemas/siniestros-alta'
import { Aviso } from '@/components/aviso'
import { OpcionesSegmentadas } from '@/components/opciones-segmentadas'
import { SelectField } from '@/components/select-field'
import { TextField } from '@/components/text-field'
import { TextareaField } from '@/components/textarea-field'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { OcupanteBorrador, TitularBorrador, VehiculoBorrador } from '../borrador-alta'
import { documentoRepetido, paisDelDomicilio } from '../personas-alta'

export type ModoPersona = 'titular' | 'ocupante'
type PersonaBorrador = TitularBorrador | OcupanteBorrador
type PersonaData = TitularAltaData | OcupanteAltaData

/** Lo que se escribe en el modal: titular y ocupante comparten los datos personales. El país solo filtra provincias. */
type PersonaFormulario = Omit<TitularAltaInput, 'ibaEnVehiculo'> &
  Pick<OcupanteAltaInput, 'relacionPropietario'> & { ibaEnVehiculo: boolean; pais: string }

const personaVacia: PersonaFormulario = {
  ibaEnVehiculo: true,
  lugar: '',
  lugarOtro: '',
  relacionPropietario: '',
  nombreCompletoRazonSocial: '',
  idTipoDocumento: '',
  documento: '',
  estadoCivil: '',
  sexo: '',
  fechaNacimiento: '',
  numeroPermisoConducir: '',
  fechaVencimientoCarnet: '',
  telefono: '',
  email: '',
  pais: '',
  domicilio: { idProvincia: '', localidad: '', calle: '', codigoPostal: '' },
  conLesiones: false,
  tipoLesion: '',
  descripcionLesiones: '',
}

// Cada modo valida con su schema compartido; lo que no le corresponde (el país, la relación del titular…) se quita
const esquemas = {
  titular: z
    .custom<PersonaFormulario>()
    .transform(({ pais: _pais, relacionPropietario: _relacion, ...datos }) => datos)
    .pipe(titularAltaSchema),
  ocupante: z
    .custom<PersonaFormulario>()
    .transform(({ pais: _pais, ibaEnVehiculo: _iba, ...datos }) => datos)
    .pipe(ocupanteAltaSchema),
}

const texto = (valor: string | null | undefined) => valor ?? ''
function aFormulario(p: PersonaBorrador, opciones: OpcionesAltaSiniestro): PersonaFormulario {
  const provincia = opciones.provincias.find((x) => x.id === p.domicilio.idProvincia)
  return {
    ibaEnVehiculo: 'ibaEnVehiculo' in p ? p.ibaEnVehiculo : true,
    lugar: texto(p.lugar),
    lugarOtro: texto(p.lugarOtro),
    relacionPropietario: 'relacionPropietario' in p ? texto(p.relacionPropietario) : '',
    nombreCompletoRazonSocial: texto(p.nombreCompletoRazonSocial),
    idTipoDocumento: p.idTipoDocumento ? String(p.idTipoDocumento) : '',
    documento: texto(p.documento),
    estadoCivil: texto(p.estadoCivil),
    sexo: texto(p.sexo),
    fechaNacimiento: texto(p.fechaNacimiento),
    numeroPermisoConducir: texto(p.numeroPermisoConducir),
    fechaVencimientoCarnet: texto(p.fechaVencimientoCarnet),
    telefono: texto(p.telefono),
    email: texto(p.email),
    pais: paisDelDomicilio(p.domicilio.idProvincia, opciones),
    domicilio: {
      idProvincia: provincia ? String(provincia.id) : '',
      localidad: texto(p.domicilio.localidad),
      calle: texto(p.domicilio.calle),
      codigoPostal: texto(p.domicilio.codigoPostal),
    },
    conLesiones: p.conLesiones,
    tipoLesion: texto(p.tipoLesion),
    descripcionLesiones: texto(p.descripcionLesiones),
  }
}

// CU-09 pasos 11-18 (E4-06). El titular empieza por si iba en el vehículo; el ocupante, por dónde iba (y, si
// manejaba, su relación con el titular). Todo es opcional. Las lesiones quedan detrás de "¿Tuvo lesiones?".
// Un documento que ya está en el alta no se puede guardar (CU-09 13.b y 16.a). Se monta mientras está abierto.
export function PersonaDialog({
  modo,
  vehiculo,
  persona,
  vehiculos,
  opciones,
  onGuardar,
  onCerrar,
  elementoAlCerrar,
}: {
  modo: ModoPersona
  vehiculo: VehiculoBorrador
  /** null: cargar una nueva */
  persona: PersonaBorrador | null
  /** Todo el alta, para avisar si el documento ya está cargado */
  vehiculos: VehiculoBorrador[]
  opciones: OpcionesAltaSiniestro
  onGuardar: (datos: PersonaData) => void
  onCerrar: () => void
  elementoAlCerrar: () => HTMLElement | null
}) {
  const nueva = persona === null
  const formulario = useRef<HTMLFormElement>(null)
  const [agregado, setAgregado] = useState<string | null>(null)
  const vacia = {
    ...personaVacia,
    pais: paisDelDomicilio(null, opciones),
  }
  const {
    control,
    register,
    handleSubmit,
    reset,
    setFocus,
    setValue,
    formState: { errors },
  } = useForm<PersonaFormulario, unknown, PersonaData>({
    resolver: zodResolver(esquemas[modo]),
    defaultValues: persona ? aFormulario(persona, opciones) : vacia,
  })
  const iba = useWatch({ control, name: 'ibaEnVehiculo' })
  const lugar = useWatch({ control, name: 'lugar' })
  const conLesiones = useWatch({ control, name: 'conLesiones' })
  const pais = useWatch({ control, name: 'pais' })
  const documento = useWatch({ control, name: 'documento' })
  const repetido = documentoRepetido(vehiculos, documento, persona?.clave ?? null)
  const provincias = opciones.provincias.filter((p) => String(p.idPais) === pais)

  // Al abrir (y después de "Guardar y agregar otro"): la primera pregunta del modal
  const enfocarPrimera = () =>
    formulario.current
      ?.querySelector<HTMLElement>('input[type=radio]:checked, button[role=combobox]')
      ?.focus()

  const guardar = (seguir: boolean) =>
    handleSubmit((datos) => {
      // Documento repetido: el error ya está a la vista en el campo; se corrige o se cancela
      if (repetido) return setFocus('documento')
      onGuardar(datos)
      if (!seguir) return onCerrar()
      reset(vacia)
      setAgregado('Se agregó el ocupante. Ya podés cargar el siguiente.')
      requestAnimationFrame(enfocarPrimera)
    })

  const elegir = (nombre: string) => `Elegir ${nombre}…`
  const titulo =
    modo === 'titular'
      ? `${nueva ? 'Cargar' : 'Modificar'} titular del vehículo ${vehiculo.dominio}`
      : `${nueva ? 'Agregar' : 'Modificar'} ocupante del vehículo ${vehiculo.dominio}`

  return (
    <Dialog open onOpenChange={(abrir) => !abrir && onCerrar()}>
      <DialogContent
        size="wide"
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          enfocarPrimera()
        }}
        onCloseAutoFocus={(e) => {
          const elemento = elementoAlCerrar()
          if (elemento) {
            e.preventDefault()
            elemento.focus()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>Todos los datos son opcionales: cargá lo que sepas.</DialogDescription>
        </DialogHeader>
        <form
          ref={formulario}
          noValidate
          onSubmit={(e) => void guardar(false)(e)}
          className="grid gap-7"
        >
          {agregado && (
            <Aviso tipo="exito">
              <span role="status">{agregado}</span>
            </Aviso>
          )}

          <Seccion titulo="En el vehículo">
            {modo === 'titular' && (
              <Controller
                control={control}
                name="ibaEnVehiculo"
                render={({ field }) => (
                  <OpcionesSegmentadas
                    leyenda="¿Iba en el vehículo al momento del hecho?"
                    name="ibaEnVehiculo"
                    opciones={[
                      { valor: 'si', etiqueta: 'Sí, iba' },
                      { valor: 'no', etiqueta: 'No iba' },
                    ]}
                    valor={field.value ? 'si' : 'no'}
                    onCambio={(valor) => field.onChange(valor === 'si')}
                  />
                )}
              />
            )}
            {(modo === 'ocupante' || iba) && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="lugar"
                  render={({ field }) => (
                    <SelectField
                      label="Lugar en el vehículo"
                      opcionVacia="Sin especificar"
                      placeholder={elegir('lugar')}
                      opciones={LUGARES_EN_VEHICULO.map((l) => ({ valor: l, etiqueta: l }))}
                      value={String(field.value ?? '')}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      error={errors.lugar?.message}
                    />
                  )}
                />
                {lugar === 'Otro' && (
                  <TextField
                    label="¿Dónde iba?"
                    autoComplete="off"
                    maxLength={60}
                    placeholder="Por ejemplo: en la caja de carga"
                    error={errors.lugarOtro?.message}
                    {...register('lugarOtro')}
                  />
                )}
                {/* Solo para quien manejaba sin ser el titular: por qué tenía el vehículo */}
                {modo === 'ocupante' && lugar === CONDUCTOR && (
                  <TextField
                    label="Relación con el titular"
                    containerClassName="sm:col-span-2"
                    autoComplete="off"
                    maxLength={150}
                    hint="Por ejemplo: hijo de la titular, empleado de la empresa, préstamo."
                    error={errors.relacionPropietario?.message}
                    {...register('relacionPropietario')}
                  />
                )}
              </div>
            )}
          </Seccion>

          <Seccion titulo="Datos personales">
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Nombre completo o razón social"
                containerClassName="sm:col-span-2"
                autoComplete="off"
                maxLength={150}
                hint="Si no lo sabés, se muestra como «Desconocido»."
                error={errors.nombreCompletoRazonSocial?.message}
                {...register('nombreCompletoRazonSocial')}
              />
              <Controller
                control={control}
                name="idTipoDocumento"
                render={({ field }) => (
                  <SelectField
                    label="Tipo de documento"
                    opcionVacia="Sin especificar"
                    placeholder={elegir('tipo')}
                    opciones={opciones.tiposDocumento.map((t) => ({
                      valor: String(t.id),
                      etiqueta: t.nombre,
                    }))}
                    value={String(field.value ?? '')}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    error={errors.idTipoDocumento?.message}
                  />
                )}
              />
              <TextField
                label="Número de documento"
                autoComplete="off"
                maxLength={30}
                error={
                  errors.documento?.message ??
                  (repetido
                    ? `Esta persona ya está cargada como ${repetido}. Corregí el documento o cancelá la carga.`
                    : undefined)
                }
                {...register('documento')}
              />
              <Controller
                control={control}
                name="estadoCivil"
                render={({ field }) => (
                  <SelectField
                    label="Estado civil"
                    opcionVacia="Sin especificar"
                    placeholder={elegir('estado civil')}
                    opciones={ESTADOS_CIVILES.map((e) => ({ valor: e, etiqueta: e }))}
                    value={String(field.value ?? '')}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  />
                )}
              />
              <Controller
                control={control}
                name="sexo"
                render={({ field }) => (
                  <SelectField
                    label="Sexo"
                    opcionVacia="Sin especificar"
                    placeholder={elegir('sexo')}
                    opciones={SEXOS.map((s) => ({ valor: s, etiqueta: s }))}
                    value={String(field.value ?? '')}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  />
                )}
              />
              <TextField
                label="Fecha de nacimiento"
                type="date"
                max={hoyArgentina()}
                error={errors.fechaNacimiento?.message}
                {...register('fechaNacimiento')}
              />
              <TextField
                label="Teléfono"
                type="tel"
                autoComplete="off"
                maxLength={50}
                error={errors.telefono?.message}
                {...register('telefono')}
              />
              <TextField
                label="Email"
                type="email"
                autoComplete="off"
                maxLength={120}
                placeholder="nombre@ejemplo.com"
                error={errors.email?.message}
                {...register('email')}
              />
            </div>
          </Seccion>

          <Seccion titulo="Permiso de conducir">
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Número de permiso"
                autoComplete="off"
                maxLength={30}
                error={errors.numeroPermisoConducir?.message}
                {...register('numeroPermisoConducir')}
              />
              <TextField
                label="Fecha de vencimiento"
                type="date"
                error={errors.fechaVencimientoCarnet?.message}
                {...register('fechaVencimientoCarnet')}
              />
            </div>
          </Seccion>

          <Seccion titulo="Domicilio">
            <div className="grid gap-5 sm:grid-cols-2">
              <Controller
                control={control}
                name="pais"
                render={({ field }) => (
                  <SelectField
                    label="País"
                    opcionVacia="Sin especificar"
                    placeholder={elegir('país')}
                    opciones={opciones.paises.map((p) => ({
                      valor: String(p.id),
                      etiqueta: p.nombre,
                    }))}
                    value={field.value}
                    onChange={(valor) => {
                      field.onChange(valor)
                      setValue('domicilio.idProvincia', '')
                    }}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  />
                )}
              />
              <Controller
                control={control}
                name="domicilio.idProvincia"
                render={({ field }) => (
                  <SelectField
                    label="Provincia"
                    opcionVacia="Sin especificar"
                    placeholder={pais ? elegir('provincia') : 'Primero elegí el país'}
                    disabled={!pais}
                    opciones={provincias.map((p) => ({ valor: String(p.id), etiqueta: p.nombre }))}
                    value={String(field.value ?? '')}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    error={errors.domicilio?.idProvincia?.message}
                  />
                )}
              />
              <TextField
                label="Localidad"
                autoComplete="off"
                maxLength={100}
                error={errors.domicilio?.localidad?.message}
                {...register('domicilio.localidad')}
              />
              <TextField
                label="Calle y altura"
                autoComplete="off"
                maxLength={150}
                error={errors.domicilio?.calle?.message}
                {...register('domicilio.calle')}
              />
              <TextField
                label="Código postal"
                autoComplete="off"
                maxLength={20}
                error={errors.domicilio?.codigoPostal?.message}
                {...register('domicilio.codigoPostal')}
              />
            </div>
          </Seccion>

          <Seccion titulo="Lesiones">
            <Controller
              control={control}
              name="conLesiones"
              render={({ field }) => (
                <OpcionesSegmentadas
                  leyenda="¿Tuvo lesiones?"
                  name="conLesiones"
                  opciones={[
                    { valor: 'no', etiqueta: 'No' },
                    { valor: 'si', etiqueta: 'Sí' },
                  ]}
                  valor={field.value ? 'si' : 'no'}
                  onCambio={(valor) => field.onChange(valor === 'si')}
                />
              )}
            />
            {conLesiones && (
              <>
                <div className="grid gap-1.5">
                  <Controller
                    control={control}
                    name="tipoLesion"
                    render={({ field }) => (
                      <OpcionesSegmentadas
                        leyenda="Gravedad"
                        name="tipoLesion"
                        columnas="grid-cols-2 sm:grid-cols-4"
                        opciones={(Object.keys(GRAVEDADES_LESION) as TipoLesion[]).map((g) => ({
                          valor: g,
                          etiqueta: GRAVEDADES_LESION[g],
                        }))}
                        valor={String(field.value ?? '') as TipoLesion}
                        onCambio={field.onChange}
                      />
                    )}
                  />
                  {errors.tipoLesion && (
                    <p role="alert" className="text-sm font-semibold text-destructive">
                      {errors.tipoLesion.message}
                    </p>
                  )}
                </div>
                <TextareaField
                  label="Descripción de las lesiones"
                  maxLength={2000}
                  hint="Qué parte del cuerpo, diagnóstico y tratamiento. Podés usar un renglón por lesión."
                  error={errors.descripcionLesiones?.message}
                  {...register('descripcionLesiones')}
                />
              </>
            )}
          </Seccion>

          <DialogFooter className="gap-3">
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            {modo === 'ocupante' && nueva && (
              <Button type="button" variant="outline" onClick={(e) => void guardar(true)(e)}>
                <Plus aria-hidden="true" />
                Guardar y agregar otro
              </Button>
            )}
            <Button type="submit">
              {!nueva
                ? 'Guardar cambios'
                : modo === 'titular'
                  ? 'Guardar titular'
                  : 'Agregar ocupante'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="grid gap-5">
      <h3 className="border-b-2 border-line pb-2 text-lg font-bold text-primary">{titulo}</h3>
      {children}
    </section>
  )
}
