import { useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Plus } from 'lucide-react'
import type { RolAccidente } from '@cova/shared/schemas/enums'
import {
  ANIO_VEHICULO_MINIMO,
  ROLES_ACCIDENTE,
  USOS_VEHICULO,
  normalizarDominio,
  vehiculoAltaSchema,
  type OpcionesAltaSiniestro,
  type VehiculoAltaData,
  type VehiculoAltaInput,
} from '@cova/shared/schemas/siniestros-alta'
import { Aviso } from '@/components/aviso'
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
import { cn } from '@/lib/utils'
import { vehiculoVacio, type VehiculoBorrador } from '../borrador-alta'

// "Sin seguro o no se sabe": Radix no admite una opción con valor vacío; se guarda sin aseguradora
const SIN_SEGURO = 'ninguna'

const aFormulario = (v: VehiculoBorrador): VehiculoAltaInput => ({
  rolAccidente: v.rolAccidente,
  marca: v.marca ?? '',
  modelo: v.modelo ?? '',
  version: v.version ?? '',
  dominio: v.dominio,
  numeroChasis: v.numeroChasis ?? '',
  numeroMotor: v.numeroMotor ?? '',
  anio: v.anio === null || v.anio === undefined ? '' : String(v.anio),
  uso: v.uso ?? '',
  tipo: v.tipo ?? '',
  color: v.color ?? '',
  idAseguradora: v.idAseguradora ? String(v.idAseguradora) : '',
  acreedorPrendario: v.acreedorPrendario ?? '',
  descripcionDanos: v.descripcionDanos ?? '',
})

// Uno nuevo arranca con un rol marcado: asegurado si todavía no hay ninguno (con la aseguradora del siniestro
// propuesta), tercero si ya lo hay.
function vehiculoNuevo(hayAsegurado: boolean, idAseguradoraSiniestro: string): VehiculoAltaInput {
  return hayAsegurado
    ? { ...vehiculoVacio, rolAccidente: 'TERCERO' }
    : { ...vehiculoVacio, rolAccidente: 'ASEGURADO', idAseguradora: idAseguradoraSiniestro }
}

// CU-09 pasos 7-9 (E4-05). Solo el rol y el dominio son obligatorios. El dominio no se puede repetir en el
// siniestro (9.a); un segundo vehículo asegurado se permite, pero se avisa. Se monta mientras está abierto: cada
// apertura empieza con su vehículo o vacía.
export function VehiculoDialog({
  vehiculo,
  otros,
  aseguradoras,
  idAseguradoraSiniestro,
  onGuardar,
  onCerrar,
  elementoAlCerrar,
}: {
  /** null: agregar uno nuevo */
  vehiculo: VehiculoBorrador | null
  /** Los demás vehículos del alta (sin el que se está modificando) */
  otros: VehiculoBorrador[]
  aseguradoras: OpcionesAltaSiniestro['aseguradoras']
  /** Aseguradora del siniestro: se propone para el vehículo asegurado */
  idAseguradoraSiniestro: string
  onGuardar: (datos: VehiculoAltaData) => void
  onCerrar: () => void
  elementoAlCerrar: () => HTMLElement | null
}) {
  const nuevo = vehiculo === null
  const primerCampo = useRef<HTMLInputElement | null>(null)
  const [agregado, setAgregado] = useState<string | null>(null)
  // La aseguradora la completó el sistema al elegir "Asegurado" (y nadie la cambió)
  const hayAsegurado = otros.some((o) => o.rolAccidente === 'ASEGURADO')
  const propuesta = useRef(nuevo && !hayAsegurado && !!idAseguradoraSiniestro)
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    setError,
    formState: { errors },
  } = useForm<VehiculoAltaInput, unknown, VehiculoAltaData>({
    resolver: zodResolver(vehiculoAltaSchema),
    defaultValues: vehiculo
      ? aFormulario(vehiculo)
      : vehiculoNuevo(hayAsegurado, idAseguradoraSiniestro),
  })
  const rol = useWatch({ control, name: 'rolAccidente' })
  const otroAsegurado = rol === 'ASEGURADO' && hayAsegurado

  function elegirRol(nuevoRol: RolAccidente) {
    setValue('rolAccidente', nuevoRol, { shouldValidate: !!errors.rolAccidente })
    // El vehículo asegurado suele estar en la misma aseguradora del siniestro: se propone, y se puede cambiar.
    // Si después pasa a ser de un tercero, se quita lo propuesto (no lo que se eligió a mano).
    const aseguradora = String(getValues('idAseguradora') ?? '')
    if (nuevoRol === 'ASEGURADO' && !aseguradora && idAseguradoraSiniestro) {
      setValue('idAseguradora', idAseguradoraSiniestro)
      propuesta.current = true
    } else if (nuevoRol === 'TERCERO' && propuesta.current) {
      setValue('idAseguradora', '')
      propuesta.current = false
    }
  }

  const guardar = (seguir: boolean) =>
    handleSubmit((datos) => {
      setAgregado(null)
      // CU-09 9.a: el mismo dominio no puede estar dos veces en el siniestro (sin contar espacios ni guiones)
      const dominio = normalizarDominio(datos.dominio)
      if (otros.some((o) => normalizarDominio(o.dominio) === dominio)) {
        setError(
          'dominio',
          { message: `El vehículo con dominio ${datos.dominio} ya está cargado en este siniestro` },
          { shouldFocus: true },
        )
        return
      }
      onGuardar(datos)
      if (!seguir) return onCerrar()
      // El siguiente arranca como tercero si ya quedó cargado un asegurado
      const conAsegurado = hayAsegurado || datos.rolAccidente === 'ASEGURADO'
      reset(vehiculoNuevo(conAsegurado, idAseguradoraSiniestro))
      propuesta.current = !conAsegurado && !!idAseguradoraSiniestro
      setAgregado(`Se agregó el vehículo ${datos.dominio}. Ya podés cargar el siguiente.`)
      // Después de dibujar el formulario nuevo: la opción marcada puede haber cambiado
      requestAnimationFrame(() => primerCampo.current?.focus())
    })

  const { ref: refRol, ...rolCampo } = register('rolAccidente')

  return (
    <Dialog open onOpenChange={(abrir) => !abrir && onCerrar()}>
      <DialogContent
        size="wide"
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          primerCampo.current?.focus()
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
          <DialogTitle>
            {nuevo ? 'Agregar vehículo' : `Modificar vehículo ${vehiculo?.dominio ?? ''}`}
          </DialogTitle>
          <DialogDescription>
            Solo el dominio es obligatorio. El resto, si lo tenés.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(e) => void guardar(false)(e)} className="grid gap-5">
          {agregado && (
            <Aviso tipo="exito" className="mb-0">
              <span role="status">{agregado}</span>
            </Aviso>
          )}

          {/* Un solo control de dos partes: siempre hay una marcada. Son botones de opción (las flechas cambian
              de una a otra); la elegida se distingue por el relleno, el ícono y el texto en negrita. */}
          <fieldset className="grid gap-2">
            <legend className="mb-2 font-semibold">El vehículo es del</legend>
            <div className="grid grid-cols-2 gap-1 rounded-xl border-2 border-primary bg-surface p-1">
              {(Object.keys(ROLES_ACCIDENTE) as RolAccidente[]).map((opcion) => {
                const elegido = rol === opcion
                return (
                  <label
                    key={opcion}
                    className={cn(
                      'flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-lg transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                      elegido
                        ? 'bg-primary font-bold text-primary-foreground'
                        : 'font-semibold text-primary hover:bg-accent',
                    )}
                  >
                    <input
                      type="radio"
                      value={opcion}
                      {...rolCampo}
                      ref={(elemento) => {
                        refRol(elemento)
                        // El foco va a la opción marcada, como en cualquier grupo de opciones
                        if (elegido) primerCampo.current = elemento
                      }}
                      onChange={() => elegirRol(opcion)}
                      className="sr-only"
                    />
                    {elegido && <Check className="size-6" strokeWidth={3} aria-hidden="true" />}
                    {ROLES_ACCIDENTE[opcion]}
                  </label>
                )
              })}
            </div>
            {otroAsegurado && (
              <p className="rounded-md border-2 border-warning-ink bg-warning-bg px-3 py-2 text-sm font-semibold text-warning-ink">
                Ya hay un vehículo asegurado en este siniestro. Podés agregar otro si corresponde.
              </p>
            )}
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Dominio"
              required
              autoComplete="off"
              maxLength={15}
              placeholder="AA 000 AA"
              className="uppercase placeholder:normal-case"
              error={errors.dominio?.message}
              {...register('dominio')}
            />
            <TextField
              label="Marca"
              autoComplete="off"
              maxLength={60}
              placeholder="Por ejemplo: Ford"
              error={errors.marca?.message}
              {...register('marca')}
            />
            <TextField
              label="Modelo"
              autoComplete="off"
              maxLength={60}
              placeholder="Por ejemplo: Ranger"
              error={errors.modelo?.message}
              {...register('modelo')}
            />
            <TextField
              label="Versión"
              autoComplete="off"
              maxLength={100}
              placeholder="Por ejemplo: XLT 3.2 4x4 AT"
              error={errors.version?.message}
              {...register('version')}
            />
            <TextField
              label="Nro. de chasis"
              autoComplete="off"
              maxLength={40}
              className="uppercase"
              error={errors.numeroChasis?.message}
              {...register('numeroChasis')}
            />
            <TextField
              label="Nro. de motor"
              autoComplete="off"
              maxLength={40}
              className="uppercase"
              error={errors.numeroMotor?.message}
              {...register('numeroMotor')}
            />
            <TextField
              label="Año"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder="AAAA"
              hint={`Desde ${ANIO_VEHICULO_MINIMO}.`}
              error={errors.anio?.message}
              {...register('anio')}
            />
            <Controller
              control={control}
              name="uso"
              render={({ field }) => (
                <SelectField
                  label="Uso del vehículo"
                  placeholder="Elegir uso…"
                  opciones={Object.entries(USOS_VEHICULO).map(([valor, etiqueta]) => ({
                    valor,
                    etiqueta,
                  }))}
                  value={String(field.value ?? '')}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  error={errors.uso?.message}
                />
              )}
            />
            <TextField
              label="Tipo / estilo"
              autoComplete="off"
              maxLength={60}
              placeholder="Por ejemplo: sedán 4 puertas"
              error={errors.tipo?.message}
              {...register('tipo')}
            />
            <TextField
              label="Color"
              autoComplete="off"
              maxLength={40}
              error={errors.color?.message}
              {...register('color')}
            />
            <Controller
              control={control}
              name="idAseguradora"
              render={({ field }) => (
                <SelectField
                  label="Aseguradora del vehículo"
                  placeholder="Elegir aseguradora…"
                  opciones={[
                    { valor: SIN_SEGURO, etiqueta: 'Sin seguro o no se sabe' },
                    ...aseguradoras.map((a) => ({ valor: String(a.id), etiqueta: a.nombre })),
                  ]}
                  value={String(field.value ?? '')}
                  onChange={(valor) => {
                    propuesta.current = false
                    field.onChange(valor === SIN_SEGURO ? '' : valor)
                  }}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  error={errors.idAseguradora?.message}
                />
              )}
            />
            <TextField
              label="Acreedor prendario"
              autoComplete="off"
              maxLength={100}
              hint="Si el vehículo tiene una prenda, a favor de quién."
              error={errors.acreedorPrendario?.message}
              {...register('acreedorPrendario')}
            />
            <TextareaField
              label="Daños del vehículo"
              containerClassName="sm:col-span-2"
              maxLength={2000}
              hint="Qué parte, de qué lado y cómo quedó. Podés usar un renglón por daño."
              error={errors.descripcionDanos?.message}
              {...register('descripcionDanos')}
            />
          </div>

          <DialogFooter className="gap-3">
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            {nuevo && (
              <Button type="button" variant="outline" onClick={(e) => void guardar(true)(e)}>
                <Plus aria-hidden="true" />
                Guardar y agregar otro
              </Button>
            )}
            <Button type="submit">{nuevo ? 'Agregar vehículo' : 'Guardar cambios'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
