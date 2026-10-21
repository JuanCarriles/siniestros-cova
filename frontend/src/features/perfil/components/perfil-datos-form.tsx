import { z } from 'zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { perfilDatosSchema, type Perfil, type PerfilDatosData } from '@cova/shared/schemas/perfil'
import type { CatalogosUsuarios } from '@cova/shared/schemas/usuarios-abm'
import { Aviso } from '@/components/aviso'
import { TextField } from '@/components/text-field'
import { SelectField } from '@/components/select-field'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { guardarPerfil } from '../api/perfil.api'

const esquema = perfilDatosSchema
  .extend({ pais: z.string() })
  .transform(({ pais: _pais, ...datos }) => datos)

export function PerfilDatosForm({
  perfil,
  catalogos,
  contrasenaActual,
  onCancelar,
  onGuardado,
}: {
  perfil: Perfil
  catalogos: CatalogosUsuarios
  contrasenaActual: string
  onCancelar: () => void
  onGuardado: () => void
}) {
  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof esquema>, unknown, PerfilDatosData>({
    resolver: zodResolver(esquema),
    defaultValues: {
      nombres: perfil.nombres,
      apellidos: perfil.apellidos,
      documento: perfil.documento,
      telefono: perfil.telefono,
      email: perfil.email,
      pais: perfil.direccion.provincia ? String(perfil.direccion.provincia.idPais) : '',
      direccion: {
        idProvincia:
          perfil.direccion.idProvincia === null ? '' : String(perfil.direccion.idProvincia),
        localidad: perfil.direccion.localidad ?? '',
        calle: perfil.direccion.calle ?? '',
        pisoDepartamento: perfil.direccion.pisoDepartamento ?? '',
        codigoPostal: perfil.direccion.codigoPostal ?? '',
      },
    },
  })
  const pais = useWatch({ control, name: 'pais' })
  const paises = [...catalogos.paises]
  const provincias = [...catalogos.provincias]
  const actual = perfil.direccion.provincia
  if (actual && !paises.some((p) => p.id === actual.pais.id)) paises.push(actual.pais)
  if (actual && !provincias.some((p) => p.id === actual.id)) provincias.push(actual)
  const guardar = handleSubmit(async (datos) => {
    try {
      await guardarPerfil({ ...datos, contrasenaActual })
      onGuardado()
    } catch (err) {
      const campo =
        err instanceof ApiError &&
        err.detalles &&
        typeof err.detalles === 'object' &&
        'campo' in err.detalles
          ? err.detalles.campo
          : null
      if (err instanceof ApiError && (campo === 'email' || campo === 'direccion.idProvincia'))
        setError(campo, { message: err.message }, { shouldFocus: true })
      else
        setError('root', {
          message: err instanceof ApiError ? err.message : 'No se pudo guardar. Probá de nuevo.',
        })
    }
  })
  return (
    <form noValidate onSubmit={(e) => void guardar(e)} className="grid gap-5">
      <p className="text-base text-muted-foreground">
        El rol y el estado los gestiona la administración y se conservan al guardar.
      </p>
      {errors.root?.message && (
        <Aviso tipo="error" enfocar>
          {errors.root.message}
        </Aviso>
      )}
      <fieldset disabled={isSubmitting} className="grid gap-5">
        <legend className="sr-only">Editar mis datos personales</legend>
        <TextField
          label="Email"
          type="email"
          required
          maxLength={120}
          autoComplete="off"
          spellCheck={false}
          error={errors.email?.message}
          {...register('email')}
        />
        <fieldset className="grid gap-4 border-t pt-5">
          <legend className="mb-4 font-semibold text-primary">Datos personales</legend>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <TextField
              id="perfil-nombres"
              label="Nombres"
              required
              maxLength={60}
              autoComplete="off"
              error={errors.nombres?.message}
              {...register('nombres')}
            />
            <TextField
              label="Apellidos"
              required
              maxLength={60}
              autoComplete="off"
              error={errors.apellidos?.message}
              {...register('apellidos')}
            />
            <TextField
              label="Documento"
              required
              maxLength={30}
              autoComplete="off"
              error={errors.documento?.message}
              {...register('documento')}
            />
            <TextField
              label="Teléfono"
              required
              type="tel"
              maxLength={30}
              autoComplete="off"
              error={errors.telefono?.message}
              {...register('telefono')}
            />
          </div>
        </fieldset>
        <fieldset className="grid gap-4 border-t pt-5">
          <legend className="mb-1 pt-2 font-semibold text-primary">Ubicación</legend>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <SelectField
              label="País"
              required
              placeholder="Elegir país…"
              opciones={paises.map((p) => ({ valor: String(p.id), etiqueta: p.nombre }))}
              value={pais}
              onChange={(valor) => {
                setValue('pais', valor, { shouldDirty: true })
                setValue('direccion.idProvincia', '', { shouldDirty: true })
              }}
            />
            <Controller
              name="direccion.idProvincia"
              control={control}
              render={({ field }) => (
                <SelectField
                  label="Provincia"
                  required
                  placeholder="Elegir provincia…"
                  disabled={!pais}
                  opciones={provincias
                    .filter((p) => String(p.idPais) === pais)
                    .map((p) => ({ valor: String(p.id), etiqueta: p.nombre }))}
                  value={String(field.value ?? '')}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                  error={errors.direccion?.idProvincia?.message}
                />
              )}
            />
            <TextField
              label="Localidad"
              autoComplete="off"
              error={errors.direccion?.localidad?.message}
              {...register('direccion.localidad')}
            />
            <TextField
              label="Código postal"
              autoComplete="off"
              error={errors.direccion?.codigoPostal?.message}
              {...register('direccion.codigoPostal')}
            />
            <TextField
              label="Calle y número"
              autoComplete="off"
              error={errors.direccion?.calle?.message}
              {...register('direccion.calle')}
            />
            <TextField
              label="Piso y departamento"
              autoComplete="off"
              error={errors.direccion?.pisoDepartamento?.message}
              {...register('direccion.pisoDepartamento')}
            />
          </div>
        </fieldset>
      </fieldset>
      <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={isSubmitting} onClick={onCancelar}>
          Cancelar edición
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Guardar cambios
        </Button>
      </div>
    </form>
  )
}
