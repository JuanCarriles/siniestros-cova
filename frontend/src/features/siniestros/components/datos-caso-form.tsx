import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, FileText, MapPin, Siren, type LucideIcon } from 'lucide-react'
import {
  datosCasoSchema,
  hoyArgentina,
  type DatosCasoData,
  type OpcionesAltaSiniestro,
} from '@cova/shared/schemas/siniestros-alta'
import { Aviso } from '@/components/aviso'
import { SelectField } from '@/components/select-field'
import { TextField } from '@/components/text-field'
import { TextareaField } from '@/components/textarea-field'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { validarDatosCaso } from '../api/siniestros.api'
import type { DatosCasoFormulario } from '../borrador-alta'

const esquema = datosCasoSchema
  .safeExtend({ pais: z.string() })
  .transform(({ pais: _pais, ...datos }) => datos)

// Errores del servidor que se pueden marcar en su campo (el resto va arriba del formulario)
const camposServidor = [
  'numeroSiniestro',
  'idAseguradora',
  'idAjustador',
  'lugar.idProvincia',
] as const
type CampoServidor = (typeof camposServidor)[number]
const esCampoServidor = (campo: unknown): campo is CampoServidor =>
  camposServidor.includes(campo as CampoServidor)

// "Sin ajustador": Radix no admite una opción con valor vacío
const SIN_AJUSTADOR = 'ninguno'

// CU-09 pasos 4-5 (E4-04). Agrupado como en la ficha del mockup: Póliza, El hecho y Lugar del hecho. Cada cambio
// se guarda en el borrador; Continuar valida acá y en el servidor (número duplicado, ajustador de la aseguradora).
export function DatosCasoForm({
  opciones,
  valoresIniciales,
  onCambio,
  onContinuar,
  acciones,
}: {
  opciones: OpcionesAltaSiniestro
  valoresIniciales: DatosCasoFormulario
  onCambio: (valores: DatosCasoFormulario) => void
  onContinuar: (datos: DatosCasoData) => void
  /** Botones secundarios del pie (Cancelar alta) */
  acciones: ReactNode
}) {
  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DatosCasoFormulario, unknown, DatosCasoData>({
    resolver: zodResolver(esquema),
    defaultValues: valoresIniciales,
    shouldFocusError: true,
  })
  const idAseguradora = String(useWatch({ control, name: 'idAseguradora' }) ?? '')
  const pais = useWatch({ control, name: 'pais' })

  // Borrador: cada cambio queda guardado en este navegador (no al entrar: abrir la pantalla no crea un alta)
  const valores = useWatch({ control })
  const primera = useRef(true)
  useEffect(() => {
    if (primera.current) {
      primera.current = false
      return
    }
    onCambio(valores as DatosCasoFormulario)
  }, [valores, onCambio])

  const ajustadores = opciones.ajustadores.filter((a) => String(a.idAseguradora) === idAseguradora)
  const provincias = opciones.provincias.filter((p) => String(p.idPais) === pais)

  const continuar = handleSubmit(async (datos) => {
    try {
      await validarDatosCaso(datos)
      onContinuar(datos)
    } catch (err) {
      const campo =
        err instanceof ApiError &&
        err.detalles &&
        typeof err.detalles === 'object' &&
        'campo' in err.detalles
          ? err.detalles.campo
          : null
      if (err instanceof ApiError && esCampoServidor(campo))
        setError(campo, { message: err.message }, { shouldFocus: true })
      else
        setError('root', {
          message: err instanceof ApiError ? err.message : 'No se pudo continuar. Probá de nuevo.',
        })
    }
  })

  return (
    <form noValidate onSubmit={(e) => void continuar(e)} className="grid gap-6">
      {errors.root?.message && (
        <Aviso tipo="error" enfocar>
          {errors.root.message}
        </Aviso>
      )}

      <Grupo icono={FileText} titulo="Póliza">
        <TextField
          label="Número de siniestro"
          required
          autoFocus
          autoComplete="off"
          maxLength={60}
          error={errors.numeroSiniestro?.message}
          {...register('numeroSiniestro')}
        />
        <TextField
          label="Número de póliza"
          required
          autoComplete="off"
          maxLength={60}
          error={errors.numeroPoliza?.message}
          {...register('numeroPoliza')}
        />
        <TextField
          label="Inicio de vigencia"
          autoComplete="off"
          maxLength={60}
          hint="Como figura en la póliza."
          error={errors.inicioVigencia?.message}
          {...register('inicioVigencia')}
        />
        <Controller
          control={control}
          name="idAseguradora"
          render={({ field }) => (
            <SelectField
              label="Aseguradora"
              required
              placeholder="Elegir aseguradora…"
              opciones={opciones.aseguradoras.map((a) => ({
                valor: String(a.id),
                etiqueta: a.nombre,
              }))}
              value={String(field.value ?? '')}
              onChange={(valor) => {
                field.onChange(valor)
                // El ajustador pertenece a una aseguradora: al cambiarla, se vuelve a elegir
                setValue('idAjustador', '', { shouldDirty: true })
              }}
              onBlur={field.onBlur}
              ref={field.ref}
              error={errors.idAseguradora?.message}
            />
          )}
        />
        <TextField
          label="Sucursal de emisión"
          required
          autoComplete="off"
          maxLength={100}
          error={errors.sucursal?.message}
          {...register('sucursal')}
        />
        <Controller
          control={control}
          name="idAjustador"
          render={({ field }) => (
            <SelectField
              label="Ajustador"
              placeholder={idAseguradora ? 'Elegir ajustador…' : 'Primero elegí la aseguradora'}
              disabled={!idAseguradora || ajustadores.length === 0}
              hint={
                idAseguradora && ajustadores.length === 0
                  ? 'Esta aseguradora no tiene ajustadores activos. Podés asignarlo más adelante.'
                  : undefined
              }
              opciones={[
                { valor: SIN_AJUSTADOR, etiqueta: 'Sin ajustador por ahora' },
                ...ajustadores.map((a) => ({
                  valor: String(a.id),
                  etiqueta: `${a.nombre} · ${a.casosActivos} ${a.casosActivos === 1 ? 'caso activo' : 'casos activos'}`,
                })),
              ]}
              value={String(field.value ?? '')}
              onChange={(valor) => field.onChange(valor === SIN_AJUSTADOR ? '' : valor)}
              onBlur={field.onBlur}
              ref={field.ref}
              error={errors.idAjustador?.message}
            />
          )}
        />
      </Grupo>

      <Grupo icono={Siren} titulo="El hecho">
        <TextField
          label="Fecha de ocurrencia"
          type="date"
          max={hoyArgentina()}
          error={errors.fechaOcurrencia?.message}
          {...register('fechaOcurrencia')}
        />
        <TextField
          label="Hora de ocurrencia"
          type="time"
          error={errors.horaOcurrencia?.message}
          {...register('horaOcurrencia')}
        />
        <Controller
          control={control}
          name="menorEdadInvolucrado"
          render={({ field }) => (
            <fieldset className="grid content-start gap-1.5">
              <legend className="mb-1.5 font-semibold">¿Hay un menor de edad involucrado?</legend>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { valor: false, etiqueta: 'No' },
                  { valor: true, etiqueta: 'Sí' },
                ].map((opcion) => (
                  <label
                    key={opcion.etiqueta}
                    className={cn(
                      'flex min-h-12 cursor-pointer items-center gap-3 rounded-md border-2 px-4 font-semibold transition-colors focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-ring hover:bg-accent',
                      field.value === opcion.valor
                        ? 'border-primary bg-accent text-primary'
                        : 'border-input',
                    )}
                  >
                    <input
                      type="radio"
                      name={field.name}
                      checked={field.value === opcion.valor}
                      onChange={() => field.onChange(opcion.valor)}
                      onBlur={field.onBlur}
                      ref={opcion.valor ? undefined : field.ref}
                      className="size-5 accent-primary"
                    />
                    {opcion.etiqueta}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        />
        <TextareaField
          label="Causa"
          containerClassName="md:col-span-2 lg:col-span-3"
          maxLength={2000}
          hint="Cómo ocurrió, en pocas palabras. Por ejemplo: choque en cruce con semáforo."
          error={errors.causa?.message}
          {...register('causa')}
        />
      </Grupo>

      <Grupo icono={MapPin} titulo="Lugar del hecho">
        <Controller
          control={control}
          name="pais"
          render={({ field }) => (
            <SelectField
              label="País"
              placeholder="Elegir país…"
              opciones={opciones.paises.map((p) => ({ valor: String(p.id), etiqueta: p.nombre }))}
              value={field.value}
              onChange={(valor) => {
                field.onChange(valor)
                setValue('lugar.idProvincia', '', { shouldDirty: true })
              }}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
        <Controller
          control={control}
          name="lugar.idProvincia"
          render={({ field }) => (
            <SelectField
              label="Provincia"
              placeholder={pais ? 'Elegir provincia…' : 'Primero elegí el país'}
              disabled={!pais}
              opciones={provincias.map((p) => ({ valor: String(p.id), etiqueta: p.nombre }))}
              value={String(field.value ?? '')}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
              error={errors.lugar?.idProvincia?.message}
            />
          )}
        />
        <TextField
          label="Localidad"
          autoComplete="off"
          maxLength={100}
          error={errors.lugar?.localidad?.message}
          {...register('lugar.localidad')}
        />
        <TextField
          label="Calle y altura"
          autoComplete="off"
          maxLength={150}
          error={errors.lugar?.calle?.message}
          {...register('lugar.calle')}
        />
        <TextField
          label="Código postal"
          autoComplete="off"
          maxLength={20}
          error={errors.lugar?.codigoPostal?.message}
          {...register('lugar.codigoPostal')}
        />
      </Grupo>

      <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-3">{acciones}</div>
        <Button type="submit" size="lg" loading={isSubmitting}>
          Continuar
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </form>
  )
}

function Grupo({
  icono: Icono,
  titulo,
  children,
}: {
  icono: LucideIcon
  titulo: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className="min-w-0 rounded-xl border bg-card p-5 shadow-card sm:p-6"
    >
      <h2 id={id} className="mb-5 flex items-center gap-3 text-xl font-bold text-primary">
        <span
          className="grid size-10 place-items-center rounded-lg bg-callout-bg"
          aria-hidden="true"
        >
          <Icono className="size-5" />
        </span>
        {titulo}
      </h2>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  )
}
