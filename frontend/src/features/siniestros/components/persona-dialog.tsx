import { useRef, useState, type ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Check, Plus, TriangleAlert } from 'lucide-react'
import type { TipoLesion } from '@cova/shared/schemas/enums'
import {
  CONDUCTOR,
  ESTADOS_CIVILES,
  GRAVEDADES_LESION,
  LUGARES_EN_VEHICULO,
  ROLES_SIN_VEHICULO,
  SEXOS,
  hoyArgentina,
  ocupanteAltaSchema,
  personaExternaAltaSchema,
  titularAltaSchema,
  type OcupanteAltaData,
  type OcupanteAltaInput,
  type OpcionesAltaSiniestro,
  type PersonaExternaAltaData,
  type TitularAltaData,
  type TitularAltaInput,
} from '@cova/shared/schemas/siniestros-alta'
import { Aviso } from '@/components/aviso'
import { OpcionesSegmentadas } from '@/components/opciones-segmentadas'
import { SelectField } from '@/components/select-field'
import { TextField } from '@/components/text-field'
import { TextareaField } from '@/components/textarea-field'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type {
  OcupanteBorrador,
  PersonaExternaBorrador,
  TitularBorrador,
  VehiculoBorrador,
} from '../borrador-alta'
import { documentoRepetido, type Involucrados } from '../personas-alta'

/** titular y ocupante, de un vehículo; externa, alguien que no iba en ninguno (peatón, testigo…) */
export type ModoPersona = 'titular' | 'ocupante' | 'externa'
type PersonaBorrador = TitularBorrador | OcupanteBorrador | PersonaExternaBorrador
type PersonaData = TitularAltaData | OcupanteAltaData | PersonaExternaAltaData

/** Lo que se escribe en el modal: todos comparten los datos personales. El país solo filtra provincias. */
type PersonaFormulario = Omit<TitularAltaInput, 'ibaEnVehiculo'> &
  Pick<OcupanteAltaInput, 'relacionPropietario'> & {
    ibaEnVehiculo: boolean
    rolSinVehiculo: string
    pais: string
  }

const personaVacia: PersonaFormulario = {
  ibaEnVehiculo: true,
  rolSinVehiculo: '',
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
    .transform(
      ({ pais: _pais, relacionPropietario: _relacion, rolSinVehiculo: _rol, ...datos }) => datos,
    )
    .pipe(titularAltaSchema),
  ocupante: z
    .custom<PersonaFormulario>()
    .transform(({ pais: _pais, ibaEnVehiculo: _iba, rolSinVehiculo: _rol, ...datos }) => datos)
    .pipe(ocupanteAltaSchema),
  externa: z
    .custom<PersonaFormulario>()
    .transform(
      ({
        pais: _pais,
        ibaEnVehiculo: _iba,
        lugar: _lugar,
        lugarOtro: _lugarOtro,
        relacionPropietario: _relacion,
        numeroPermisoConducir: _permiso,
        fechaVencimientoCarnet: _vencimiento,
        ...datos
      }) => datos,
    )
    .pipe(personaExternaAltaSchema),
}

const texto = (valor: string | null | undefined) => valor ?? ''
function aFormulario(
  p: PersonaBorrador,
  provincias: OpcionesAltaSiniestro['provincias'],
): PersonaFormulario {
  const provincia = provincias.find((x) => x.id === p.domicilio.idProvincia)
  return {
    ibaEnVehiculo: 'ibaEnVehiculo' in p ? p.ibaEnVehiculo : true,
    rolSinVehiculo: 'rolSinVehiculo' in p ? p.rolSinVehiculo : '',
    lugar: 'lugar' in p ? texto(p.lugar) : '',
    lugarOtro: 'lugarOtro' in p ? texto(p.lugarOtro) : '',
    relacionPropietario: 'relacionPropietario' in p ? texto(p.relacionPropietario) : '',
    nombreCompletoRazonSocial: texto(p.nombreCompletoRazonSocial),
    idTipoDocumento: p.idTipoDocumento ? String(p.idTipoDocumento) : '',
    documento: texto(p.documento),
    estadoCivil: texto(p.estadoCivil),
    sexo: texto(p.sexo),
    fechaNacimiento: texto(p.fechaNacimiento),
    numeroPermisoConducir: 'numeroPermisoConducir' in p ? texto(p.numeroPermisoConducir) : '',
    fechaVencimientoCarnet: 'fechaVencimientoCarnet' in p ? texto(p.fechaVencimientoCarnet) : '',
    telefono: texto(p.telefono),
    email: texto(p.email),
    pais: provincia ? String(provincia.idPais) : '',
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

// CU-09 pasos 11-22 (E4-06 y E4-07). El titular empieza por si iba en el vehículo; el ocupante, por dónde iba (y,
// si manejaba, su relación con el titular); la persona fuera de los vehículos, por su rol en el siniestro, lo único
// obligatorio, y no tiene permiso de conducir. Las lesiones quedan detrás de "¿Tuvo lesiones?". Un documento que
// ya está en el alta se avisa sin bloquear. Se monta mientras está abierto.
export function PersonaDialog({
  modo,
  vehiculo,
  persona,
  involucrados,
  opciones,
  onGuardar,
  onCerrar,
  elementoAlCerrar,
}: {
  modo: ModoPersona
  /** El vehículo del titular o del ocupante; null para una persona fuera de los vehículos */
  vehiculo: VehiculoBorrador | null
  /** null: cargar una nueva */
  persona: PersonaBorrador | null
  /** Todo el alta, para avisar si el documento ya está cargado */
  involucrados: Involucrados
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
    pais: opciones.paises.length === 1 ? String(opciones.paises[0].id) : '',
  }
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitted },
  } = useForm<PersonaFormulario, unknown, PersonaData>({
    resolver: zodResolver(esquemas[modo]),
    defaultValues: persona ? aFormulario(persona, opciones.provincias) : vacia,
  })
  const iba = useWatch({ control, name: 'ibaEnVehiculo' })
  const lugar = useWatch({ control, name: 'lugar' })
  const conLesiones = useWatch({ control, name: 'conLesiones' })
  const pais = useWatch({ control, name: 'pais' })
  const documento = useWatch({ control, name: 'documento' })
  const rol = useWatch({ control, name: 'rolSinVehiculo' })
  const repetido = documentoRepetido(involucrados, documento, persona?.clave ?? null)
  const provincias = opciones.provincias.filter((p) => String(p.idPais) === pais)

  // Al abrir (y después de "Guardar y agregar otro"): la primera pregunta del modal
  const enfocarPrimera = () =>
    formulario.current
      ?.querySelector<HTMLElement>(
        'input[name=rolSinVehiculo], input[type=radio]:checked, button[role=combobox]',
      )
      ?.focus()

  const guardar = (seguir: boolean) =>
    handleSubmit((datos) => {
      onGuardar(datos)
      if (!seguir) return onCerrar()
      reset(vacia)
      setAgregado(
        modo === 'externa'
          ? 'Se agregó la persona. Ya podés cargar la siguiente.'
          : 'Se agregó el ocupante. Ya podés cargar el siguiente.',
      )
      requestAnimationFrame(enfocarPrimera)
    })

  const elegir = (nombre: string) => `Elegir ${nombre}…`
  const titulo =
    modo === 'externa'
      ? `${nueva ? 'Agregar' : 'Modificar'} persona fuera de los vehículos`
      : modo === 'titular'
        ? `${nueva ? 'Cargar' : 'Modificar'} titular del vehículo ${vehiculo?.dominio ?? ''}`
        : `${nueva ? 'Agregar' : 'Modificar'} ocupante del vehículo ${vehiculo?.dominio ?? ''}`

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
          <DialogDescription>
            {modo === 'externa'
              ? 'Solo el rol en el siniestro es obligatorio. Del resto, cargá lo que sepas.'
              : 'Todos los datos son opcionales: cargá lo que sepas.'}
          </DialogDescription>
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

          {modo === 'externa' ? (
            <Seccion titulo="En el siniestro">
              <div className="grid gap-3">
                <TextField
                  label="Rol en el siniestro"
                  required
                  autoComplete="off"
                  maxLength={100}
                  hint="Elegí un ejemplo o escribí otro: «conductor de la moto», «dueño del comercio»…"
                  error={errors.rolSinVehiculo?.message}
                  {...register('rolSinVehiculo')}
                />
                {/* Atajos: completan el campo, que se puede seguir editando */}
                <div role="group" aria-label="Ejemplos de rol" className="flex flex-wrap gap-2">
                  {ROLES_SIN_VEHICULO.map((ejemplo) => {
                    const elegido = rol.trim() === ejemplo
                    return (
                      <button
                        key={ejemplo}
                        type="button"
                        aria-pressed={elegido}
                        onClick={() =>
                          setValue('rolSinVehiculo', ejemplo, {
                            shouldDirty: true,
                            shouldValidate: isSubmitted,
                          })
                        }
                        className={cn(
                          'inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 font-semibold transition-colors hover:bg-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
                          elegido
                            ? 'border-primary bg-accent text-primary'
                            : 'border-input bg-surface',
                        )}
                      >
                        {elegido && <Check className="size-4" aria-hidden="true" />}
                        {ejemplo}
                      </button>
                    )
                  })}
                </div>
              </div>
            </Seccion>
          ) : (
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
          )}

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
              <div className="grid content-start gap-2">
                <TextField
                  label="Número de documento"
                  autoComplete="off"
                  maxLength={30}
                  error={errors.documento?.message}
                  aria-describedby={repetido ? 'documento-repetido' : undefined}
                  {...register('documento')}
                />
                {repetido && (
                  <p
                    id="documento-repetido"
                    className="flex items-start gap-2 rounded-md border-2 border-warning-ink bg-warning-bg px-3 py-2 text-sm font-semibold text-warning-ink"
                  >
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    Este documento ya está cargado como {repetido}. Podés guardarlo igual si
                    corresponde.
                  </p>
                )}
              </div>
              <Controller
                control={control}
                name="estadoCivil"
                render={({ field }) => (
                  <SelectField
                    label="Estado civil"
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

          {modo !== 'externa' && (
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
          )}

          <Seccion titulo="Domicilio">
            <div className="grid gap-5 sm:grid-cols-2">
              <Controller
                control={control}
                name="pais"
                render={({ field }) => (
                  <SelectField
                    label="País"
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
            {modo !== 'titular' && nueva && (
              <Button type="button" variant="outline" onClick={(e) => void guardar(true)(e)}>
                <Plus aria-hidden="true" />
                {modo === 'externa' ? 'Guardar y agregar otra' : 'Guardar y agregar otro'}
              </Button>
            )}
            <Button type="submit">
              {!nueva
                ? 'Guardar cambios'
                : modo === 'titular'
                  ? 'Guardar titular'
                  : modo === 'ocupante'
                    ? 'Agregar ocupante'
                    : 'Agregar persona'}
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
