import { useRef, useState, type ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, TriangleAlert } from 'lucide-react'
import {
  abogadoAltaSchema,
  type AbogadoAltaData,
  type AbogadoAltaInput,
} from '@cova/shared/schemas/siniestros-alta'
import { Aviso } from '@/components/aviso'
import { TextField } from '@/components/text-field'
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
import type { GrupoRepresentables } from '../abogados-alta'
import type { AbogadoBorrador } from '../borrador-alta'

type AbogadoFormulario = Omit<AbogadoAltaInput, 'representados'> & { representados: string[] }

const abogadoVacio: AbogadoFormulario = {
  nombreCompleto: '',
  numeroMatricula: '',
  telefono: '',
  email: '',
  representados: [],
}

const aFormulario = (a: AbogadoBorrador): AbogadoFormulario => ({
  nombreCompleto: a.nombreCompleto,
  numeroMatricula: a.numeroMatricula ?? '',
  telefono: a.telefono ?? '',
  email: a.email ?? '',
  representados: a.representados,
})

// CU-09 pasos 24-26 (E4-08). Solo el nombre y a quién representa son obligatorios (25.b); puede representar a
// varias personas (25.a). Una persona que ya tiene otro abogado se puede elegir: al guardar, pasa a este.
export function AbogadoDialog({
  abogado,
  grupos,
  representantes,
  onGuardar,
  onCerrar,
  elementoAlCerrar,
}: {
  /** null: cargar uno nuevo */
  abogado: AbogadoBorrador | null
  /** Las personas del paso 2, agrupadas por vehículo */
  grupos: GrupoRepresentables[]
  /** Quién representa hoy a cada persona */
  representantes: Map<string, AbogadoBorrador>
  onGuardar: (datos: AbogadoAltaData) => void
  onCerrar: () => void
  elementoAlCerrar: () => HTMLElement | null
}) {
  const nuevo = abogado === null
  const formulario = useRef<HTMLFormElement>(null)
  const [agregado, setAgregado] = useState<string | null>(null)
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AbogadoFormulario, unknown, AbogadoAltaData>({
    resolver: zodResolver(abogadoAltaSchema),
    defaultValues: abogado ? aFormulario(abogado) : abogadoVacio,
  })
  const elegidos = useWatch({ control, name: 'representados' })

  // Otro abogado que hoy representa a la persona (al modificar, este mismo no cuenta)
  const otroAbogado = (clave: string) => {
    const actual = representantes.get(clave)
    return actual && actual.clave !== abogado?.clave ? actual : undefined
  }
  const pasan = elegidos.filter((c) => otroAbogado(c)).length

  const enfocarPrimero = () =>
    formulario.current?.querySelector<HTMLElement>('input[name=nombreCompleto]')?.focus()

  const guardar = (seguir: boolean) =>
    handleSubmit((datos) => {
      onGuardar(datos)
      if (!seguir) return onCerrar()
      reset(abogadoVacio)
      setAgregado('Se agregó el abogado. Ya podés cargar el siguiente.')
      requestAnimationFrame(enfocarPrimero)
    })

  return (
    <Dialog open onOpenChange={(abrir) => !abrir && onCerrar()}>
      <DialogContent
        size="wide"
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          enfocarPrimero()
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
          <DialogTitle>{nuevo ? 'Agregar abogado' : 'Modificar abogado'}</DialogTitle>
          <DialogDescription>
            Solo el nombre y a quién representa son obligatorios. Del resto, cargá lo que sepas.
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

          <Seccion titulo="Datos del abogado">
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Nombre completo"
                required
                containerClassName="sm:col-span-2"
                autoComplete="off"
                maxLength={150}
                error={errors.nombreCompleto?.message}
                {...register('nombreCompleto')}
              />
              <TextField
                label="Matrícula"
                autoComplete="off"
                maxLength={40}
                hint="Como figura en la credencial: «T° 45 F° 123», «Mat. 1234»…"
                error={errors.numeroMatricula?.message}
                {...register('numeroMatricula')}
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
                containerClassName="sm:col-span-2"
                autoComplete="off"
                maxLength={120}
                placeholder="nombre@ejemplo.com"
                error={errors.email?.message}
                {...register('email')}
              />
            </div>
          </Seccion>

          <Controller
            control={control}
            name="representados"
            render={({ field }) => {
              const alternar = (clave: string, marcada: boolean) =>
                field.onChange(
                  marcada ? [...field.value, clave] : field.value.filter((c) => c !== clave),
                )
              return (
                <fieldset
                  className="grid gap-4"
                  aria-describedby={errors.representados ? 'representados-error' : undefined}
                >
                  <legend className="mb-1 w-full border-b-2 border-line pb-2 text-lg font-bold text-primary">
                    ¿A quién representa?{' '}
                    <span className="text-base font-normal text-muted-foreground">
                      (obligatorio, una o varias personas)
                    </span>
                  </legend>
                  {errors.representados && (
                    <p
                      id="representados-error"
                      role="alert"
                      className="font-semibold text-destructive"
                    >
                      {errors.representados.message}
                    </p>
                  )}
                  {grupos.map((grupo, g) => (
                    <div key={grupo.titulo} className="grid gap-2">
                      <p className="font-semibold text-muted-foreground">{grupo.titulo}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {grupo.personas.map((p, i) => {
                          const marcada = field.value.includes(p.clave)
                          const otro = otroAbogado(p.clave)
                          return (
                            <label
                              key={p.clave}
                              className={cn(
                                'flex min-h-14 cursor-pointer items-start gap-3 rounded-md border-2 px-4 py-3 transition-colors focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-ring hover:bg-accent',
                                marcada ? 'border-primary bg-accent' : 'border-input bg-surface',
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={marcada}
                                onChange={(e) => alternar(p.clave, e.target.checked)}
                                onBlur={field.onBlur}
                                // El foco del error va a la primera persona
                                ref={g === 0 && i === 0 ? field.ref : undefined}
                                className="mt-1 size-5 shrink-0 accent-primary"
                              />
                              <span className="grid gap-0.5">
                                <span className="font-bold">{p.nombre}</span>
                                <span className="text-muted-foreground">{p.detalle}</span>
                                {otro && (
                                  <span
                                    className={cn(
                                      'text-sm font-semibold',
                                      marcada ? 'text-warning-ink' : 'text-muted-foreground',
                                    )}
                                  >
                                    {marcada
                                      ? `Deja de representarla ${otro.nombreCompleto}`
                                      : `Hoy la representa ${otro.nombreCompleto}`}
                                  </span>
                                )}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </fieldset>
              )
            }}
          />

          {pasan > 0 && (
            <p className="flex items-start gap-2 rounded-md border-2 border-warning-ink bg-warning-bg px-3 py-2 font-semibold text-warning-ink">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              {pasan === 1
                ? 'Una persona elegida tiene otro abogado: al guardar, pasa a este.'
                : `${pasan} personas elegidas tienen otro abogado: al guardar, pasan a este.`}
            </p>
          )}

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
            <Button type="submit">{nuevo ? 'Agregar abogado' : 'Guardar cambios'}</Button>
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
