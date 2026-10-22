import { useEffect, useId } from 'react'
import { z } from 'zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { TipoUsuario } from '@cova/shared/schemas/enums'
import {
  usuarioFormularioSchema,
  motivoRestriccionUsuario,
  type CatalogosUsuarios,
  type UsuarioFormularioInput,
  type UsuarioFormularioData,
  type UsuarioListado,
} from '@cova/shared/schemas/usuarios-abm'
import { Aviso } from '@/components/aviso'
import { TextField } from '@/components/text-field'
import { SelectField } from '@/components/select-field'
import { PasswordField } from '@/components/password-field'
import { ReglasContrasena } from '@/components/reglas-contrasena'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { ApiError } from '@/lib/api'
import { guardarUsuario } from '../api/usuarios.api'
import { TipoUsuarioSelector } from './tipo-usuario-selector'

const vacio: UsuarioFormularioInput = {
  nombres: '',
  apellidos: '',
  documento: '',
  telefono: '',
  email: '',
  contrasena: '',
  tipoUsuario: 'GESTOR',
  direccion: { idProvincia: '', localidad: '', calle: '', pisoDepartamento: '', codigoPostal: '' },
}

export function UsuarioDialog({
  abierto,
  usuario,
  rol,
  catalogos,
  onCerrar,
  onGuardado,
  elementoAlCerrar,
}: {
  abierto: boolean
  usuario: UsuarioListado | null
  rol: TipoUsuario
  catalogos: CatalogosUsuarios
  onCerrar: () => void
  onGuardado: (mensaje: string) => void
  elementoAlCerrar: () => HTMLElement | null
}) {
  const nuevo = usuario === null
  const reglasId = useId()
  const esquema = usuarioFormularioSchema
    .extend({ pais: z.string() })
    .superRefine((datos, ctx) => {
      const motivo = motivoRestriccionUsuario(rol, datos.tipoUsuario, nuevo ? 'crear' : 'asignar')
      if (motivo) ctx.addIssue({ code: 'custom', path: ['tipoUsuario'], message: motivo })
    })
    .refine((datos) => !nuevo || datos.contrasena !== '', {
      message: 'La contraseña es obligatoria',
      path: ['contrasena'],
    })
    .transform(({ pais: _pais, ...datos }) => datos)
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    setFocus,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof esquema>, unknown, UsuarioFormularioData>({
    resolver: zodResolver(esquema),
    defaultValues: { ...vacio, pais: '' },
  })
  const contrasena = useWatch({ control, name: 'contrasena' })
  const pais = useWatch({ control, name: 'pais' })

  useEffect(() => {
    if (!abierto) return
    if (usuario) {
      reset({
        pais: usuario.direccion.provincia ? String(usuario.direccion.provincia.idPais) : '',
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        documento: usuario.documento,
        email: usuario.email,
        telefono: usuario.telefono,
        tipoUsuario: usuario.tipoUsuario,
        contrasena: '',
        direccion: {
          idProvincia:
            usuario.direccion.idProvincia === null ? '' : String(usuario.direccion.idProvincia),
          localidad: usuario.direccion.localidad ?? '',
          calle: usuario.direccion.calle ?? '',
          pisoDepartamento: usuario.direccion.pisoDepartamento ?? '',
          codigoPostal: usuario.direccion.codigoPostal ?? '',
        },
      })
    } else {
      reset({ ...vacio, pais: catalogos.paises.length === 1 ? String(catalogos.paises[0].id) : '' })
    }
  }, [abierto, usuario, catalogos, reset])

  // Se conserva la ubicación existente aunque el catálogo se haya dado de baja después.
  const paises = [...catalogos.paises]
  const provincias = [...catalogos.provincias]
  const actual = usuario?.direccion.provincia
  if (actual && !paises.some((p) => p.id === actual.pais.id)) paises.push(actual.pais)
  if (actual && !provincias.some((p) => p.id === actual.id)) provincias.push(actual)

  const guardar = handleSubmit(async (datos) => {
    try {
      const guardado = await guardarUsuario(usuario?.id ?? null, datos)
      onGuardado(
        `${nuevo ? 'Se creó a' : 'Se guardaron los cambios de'} ${guardado.nombres} ${guardado.apellidos}.`,
      )
    } catch (err) {
      const campo =
        err instanceof ApiError &&
        err.detalles &&
        typeof err.detalles === 'object' &&
        'campo' in err.detalles
          ? err.detalles.campo
          : null
      if (
        err instanceof ApiError &&
        (campo === 'email' || campo === 'tipoUsuario' || campo === 'direccion.idProvincia')
      ) {
        setError(campo, { message: err.message }, { shouldFocus: true })
      } else
        setError('root', {
          message: err instanceof ApiError ? err.message : 'No se pudo guardar. Probá de nuevo.',
        })
    }
  })

  return (
    <Dialog
      open={abierto}
      onOpenChange={(abrir) => {
        if (!abrir && !isSubmitting) onCerrar()
      }}
    >
      <DialogContent
        size="wide"
        showCloseButton={!isSubmitting}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          setFocus('nombres')
        }}
        onCloseAutoFocus={(e) => {
          const el = elementoAlCerrar()
          if (el) {
            e.preventDefault()
            el.focus()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {nuevo ? 'Nuevo usuario' : `Modificar a ${usuario.nombres} ${usuario.apellidos}`}
          </DialogTitle>
          <DialogDescription>
            {nuevo
              ? 'Completá sus datos y elegí el acceso que necesita para trabajar.'
              : 'La contraseña solo cambia si escribís una nueva.'}
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(e) => void guardar(e)} className="grid gap-6">
          {errors.root?.message && (
            <Aviso tipo="error" enfocar>
              {errors.root.message}
            </Aviso>
          )}
          <fieldset className="grid gap-4 border-t pt-5">
            <legend className="mb-4 font-semibold text-primary">Datos personales</legend>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <TextField
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
            <legend className="mb-1 pt-2 font-semibold text-primary">Acceso al sistema</legend>
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
            <Controller
              name="tipoUsuario"
              control={control}
              render={({ field }) => (
                <TipoUsuarioSelector
                  rol={rol}
                  modo={nuevo ? 'alta' : 'edicion'}
                  valor={field.value}
                  onCambio={field.onChange}
                  error={errors.tipoUsuario?.message}
                />
              )}
            />
            <PasswordField
              key={`${abierto}-${usuario?.id ?? 'nuevo'}`}
              label={nuevo ? 'Contraseña' : 'Nueva contraseña (opcional)'}
              required={nuevo}
              maxLength={128}
              autoComplete="new-password"
              placeholder={nuevo ? 'Creá una contraseña' : 'Dejala vacía para conservar la actual'}
              hint={
                nuevo
                  ? 'Usará esta contraseña para ingresar.'
                  : 'Cambiarla cerrará sus sesiones abiertas.'
              }
              aria-describedby={nuevo || contrasena ? reglasId : undefined}
              error={errors.contrasena?.message}
              {...register('contrasena')}
            />
            {(nuevo || contrasena) && <ReglasContrasena id={reglasId} valor={contrasena} />}
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
          <DialogFooter className="sticky -bottom-6 -mx-5 -mb-5 border-t bg-surface px-5 py-4 sm:-mx-6 sm:-mb-6 sm:px-6">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={isSubmitting}>
              {nuevo ? 'Crear usuario' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
