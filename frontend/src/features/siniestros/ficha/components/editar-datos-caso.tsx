import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch, type FieldPath } from 'react-hook-form'
import { FileText, Flag, LockKeyhole, MapPin, Save, UsersRound } from 'lucide-react'
import { type EdicionCaso, type ResultadoEdicionCaso } from '@cova/shared/schemas/edicion-caso'
import type { FichaSiniestro } from '@cova/shared/schemas/ficha-siniestro'
import { hoyArgentina } from '@cova/shared/schemas/siniestros-alta'
import { Aviso } from '@/components/aviso'
import { TextField } from '@/components/text-field'
import { TextareaField } from '@/components/textarea-field'
import { SelectField, type OpcionSelect } from '@/components/select-field'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { BloqueFicha, PestanaFicha } from './pestana-ficha'
import {
  resolverEdicionCaso,
  type ValoresEdicionCaso as Valores,
  type PedidoEdicionCaso as Pedido,
} from '../edicion-caso-formulario'
import { useRevision } from '../hooks/use-revision'

const campos = [
  'poliza.numeroSiniestro',
  'poliza.numeroPoliza',
  'poliza.inicioVigencia',
  'poliza.idAseguradora',
  'poliza.sucursal',
  'asignacion.idAjustador',
  'hecho.fechaOcurrencia',
  'hecho.horaOcurrencia',
  'hecho.menorEdadInvolucrado',
  'hecho.causa',
  'lugar.idProvincia',
  'lugar.localidad',
  'lugar.calle',
  'lugar.codigoPostal',
] as const

export function EditarDatosCaso({
  ficha,
  onCancelar,
  onHecho,
}: {
  ficha: FichaSiniestro
  onCancelar: () => void
  onHecho: (resultado: ResultadoEdicionCaso) => void
}) {
  const [respuesta, setRespuesta] = useState<EdicionCaso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controlador = new AbortController()
    void api<EdicionCaso>(`/siniestros/${ficha.id}/edicion`, { signal: controlador.signal })
      .then((datos) => {
        if (!controlador.signal.aborted) setRespuesta(datos)
      })
      .catch((err: unknown) => {
        if (!controlador.signal.aborted)
          setError(
            err instanceof ApiError ? err.message : 'No se pudieron cargar los datos para editar.',
          )
      })
    return () => controlador.abort()
  }, [ficha.id, revision])
  if (!respuesta)
    return (
      <PestanaFicha
        titulo="Datos del caso"
        acciones={
          <Button variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
        }
      >
        {error ? (
          <>
            <Aviso tipo="error">{error}</Aviso>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => {
                setError(null)
                setRevision((r) => r + 1)
              }}
            >
              Reintentar
            </Button>
          </>
        ) : (
          <p role="status">Cargando datos para editar…</p>
        )}
      </PestanaFicha>
    )
  return (
    <FormularioCaso
      key={ficha.id}
      respuesta={respuesta}
      ficha={ficha}
      onCancelar={onCancelar}
      onHecho={onHecho}
    />
  )
}

function FormularioCaso({
  respuesta,
  ficha,
  onCancelar,
  onHecho,
}: {
  respuesta: EdicionCaso
  ficha: FichaSiniestro
  onCancelar: () => void
  onHecho: (resultado: ResultadoEdicionCaso) => void
}) {
  const { datos, opciones, puedeEditarAsignacion: administra } = respuesta
  const [enviando, setEnviando] = useState(false)
  const revisionGuardado = useRevision(respuesta.revision)
  const form = useForm<Valores, unknown, Pedido>({
    resolver: resolverEdicionCaso(administra),
    defaultValues: {
      revision: respuesta.revision,
      pais: String(opciones.provincias.find((p) => p.id === datos.lugar.idProvincia)?.idPais ?? ''),
      poliza: {
        numeroSiniestro: datos.poliza.numeroSiniestro,
        numeroPoliza: datos.poliza.numeroPoliza,
        inicioVigencia: datos.poliza.inicioVigencia ?? '',
        idAseguradora: String(datos.poliza.idAseguradora),
        sucursal: datos.poliza.sucursal,
      },
      asignacion: {
        idAjustador: String(datos.asignacion.idAjustador ?? ''),
      },
      hecho: {
        fechaOcurrencia: datos.hecho.fechaOcurrencia ?? '',
        horaOcurrencia: datos.hecho.horaOcurrencia ?? '',
        menorEdadInvolucrado: datos.hecho.menorEdadInvolucrado,
        causa: datos.hecho.causa ?? '',
      },
      lugar: {
        idProvincia: String(datos.lugar.idProvincia ?? ''),
        localidad: datos.lugar.localidad ?? '',
        calle: datos.lugar.calle ?? '',
        codigoPostal: datos.lugar.codigoPostal ?? '',
      },
    },
  })
  const { register, control, handleSubmit, setError, clearErrors, setValue, formState } = form
  const pais = useWatch({ control, name: 'pais' })
  const aseguradora = String(useWatch({ control, name: 'poliza.idAseguradora' }) ?? '')
  const errorCampo = (nombre: FieldPath<Valores>) =>
    form.getFieldState(nombre, formState).error?.message
  const lista = (
    nombre:
      | 'pais'
      | 'poliza.idAseguradora'
      | 'asignacion.idAjustador'
      | 'hecho.menorEdadInvolucrado'
      | 'lugar.idProvincia',
    label: string,
    items: OpcionSelect[],
    requerido = false,
    onCambio?: () => void,
  ) => (
    <Controller
      control={control}
      name={nombre}
      render={({ field }) => (
        <SelectField
          label={label}
          required={requerido}
          placeholder="Elegir…"
          opcionVacia={requerido ? undefined : 'Sin especificar'}
          hint={nombre === 'pais' ? 'Elegí una provincia para guardar el país.' : undefined}
          opciones={items}
          value={String(field.value ?? '')}
          onChange={(valor) => {
            field.onChange(nombre === 'hecho.menorEdadInvolucrado' ? valor === 'true' : valor)
            onCambio?.()
          }}
          onBlur={field.onBlur}
          ref={field.ref}
          error={errorCampo(nombre)}
          disabled={enviando}
        />
      )}
    />
  )
  async function guardar(pedido: Pedido) {
    if (enviando) return
    setEnviando(true)
    try {
      await revisionGuardado.guardar(async (revision) => {
        const resultado = await api<ResultadoEdicionCaso>(`/siniestros/${ficha.id}/datos`, {
          method: 'PATCH',
          body: { ...pedido, revision },
        })
        onHecho(resultado)
      })
    } catch (err) {
      const mensaje =
        err instanceof ApiError
          ? err.message
          : 'No se pudieron guardar los cambios. Probá de nuevo.'
      const campo =
        err instanceof ApiError &&
        err.detalles &&
        typeof err.detalles === 'object' &&
        'campo' in err.detalles
          ? err.detalles.campo
          : null
      if (campos.includes(campo as (typeof campos)[number]))
        setError(campo as FieldPath<Valores>, { message: mensaje }, { shouldFocus: true })
      setError('root', { message: mensaje })
    } finally {
      setEnviando(false)
    }
  }
  const enviar = handleSubmit(async (pedido) => {
    clearErrors()
    await guardar(pedido)
  })
  const botones = (
    <>
      <Button type="button" variant="outline" disabled={enviando} onClick={onCancelar}>
        Cancelar
      </Button>
      <Button type="submit" loading={enviando}>
        <Save aria-hidden="true" />
        Guardar cambios
      </Button>
    </>
  )
  return (
    <>
      <form noValidate onSubmit={(event) => void enviar(event)}>
        <PestanaFicha
          titulo="Datos del caso"
          acciones={<div className="flex flex-wrap gap-2">{botones}</div>}
        >
          {formState.errors.root?.message && (
            <Aviso tipo="error" className="mb-4" enfocar>
              {formState.errors.root.message}
            </Aviso>
          )}
          {!administra && (
            <Aviso tipo="info" className="mb-4">
              Como gestor podés editar el hecho y el lugar. La póliza y la asignación están
              protegidas.
            </Aviso>
          )}
          <fieldset disabled={enviando} className="grid min-w-0 gap-5 lg:grid-cols-2">
            <BloqueFicha icono={FileText} titulo="Póliza">
              <fieldset disabled={!administra || enviando} className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Número de siniestro"
                  required
                  autoFocus={administra}
                  maxLength={60}
                  error={errorCampo('poliza.numeroSiniestro')}
                  {...register('poliza.numeroSiniestro')}
                />
                <TextField
                  label="Número de póliza"
                  required
                  maxLength={60}
                  error={errorCampo('poliza.numeroPoliza')}
                  {...register('poliza.numeroPoliza')}
                />
                <TextField
                  label="Inicio de vigencia"
                  maxLength={60}
                  error={errorCampo('poliza.inicioVigencia')}
                  {...register('poliza.inicioVigencia')}
                />
                {administra ? (
                  lista(
                    'poliza.idAseguradora',
                    'Aseguradora',
                    opciones.aseguradoras.map((a) => ({
                      valor: String(a.id),
                      etiqueta: `${a.nombre}${a.eliminado ? ' (dada de baja)' : ''}`,
                    })),
                    true,
                    () => setValue('asignacion.idAjustador', ''),
                  )
                ) : (
                  <TextField label="Aseguradora" value={ficha.aseguradora.nombre} readOnly />
                )}
                <TextField
                  label="Sucursal de emisión"
                  required
                  maxLength={100}
                  error={errorCampo('poliza.sucursal')}
                  {...register('poliza.sucursal')}
                />
              </fieldset>
            </BloqueFicha>
            <BloqueFicha
              icono={UsersRound}
              titulo="Asignación"
              className="border-assignment-border bg-assignment-bg"
            >
              {administra ? (
                <div className="grid gap-4">
                  <p className="text-muted-foreground">
                    Para cambiar el usuario responsable, usá Reasignar desde Datos del caso.
                  </p>
                  {lista(
                    'asignacion.idAjustador',
                    'Ajustador',
                    opciones.ajustadores
                      .filter((a) => String(a.idAseguradora) === aseguradora)
                      .map((a) => ({
                        valor: String(a.id),
                        etiqueta: `${a.nombre}${a.eliminado ? ' (dado de baja)' : ''}`,
                      })),
                  )}
                  <TextField label="Usuario asignado" value={ficha.asignado.nombre} readOnly />
                </div>
              ) : (
                <fieldset disabled className="grid gap-4">
                  <p className="flex items-center gap-2 font-semibold text-muted-foreground">
                    <LockKeyhole aria-hidden="true" className="size-5" />
                    Solo administración
                  </p>
                  <TextField
                    label="Ajustador"
                    value={ficha.ajustador?.nombre ?? 'Sin asignar'}
                    readOnly
                  />
                  <TextField label="Usuario asignado" value={ficha.asignado.nombre} readOnly />
                </fieldset>
              )}
            </BloqueFicha>
            <BloqueFicha icono={Flag} titulo="El hecho">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Fecha de ocurrencia"
                  autoFocus={!administra}
                  type="date"
                  max={hoyArgentina()}
                  error={errorCampo('hecho.fechaOcurrencia')}
                  {...register('hecho.fechaOcurrencia')}
                />
                <TextField
                  label="Hora de ocurrencia"
                  type="time"
                  step={1}
                  error={errorCampo('hecho.horaOcurrencia')}
                  {...register('hecho.horaOcurrencia')}
                />
                {lista(
                  'hecho.menorEdadInvolucrado',
                  '¿Hay un menor de edad involucrado?',
                  [
                    { valor: 'false', etiqueta: 'No' },
                    { valor: 'true', etiqueta: 'Sí' },
                  ],
                  true,
                )}
                <TextareaField
                  label="Causa"
                  containerClassName="sm:col-span-2"
                  maxLength={2000}
                  error={errorCampo('hecho.causa')}
                  {...register('hecho.causa')}
                />
              </div>
            </BloqueFicha>
            <BloqueFicha icono={MapPin} titulo="Lugar del hecho">
              <div className="grid gap-4 sm:grid-cols-2">
                {lista(
                  'pais',
                  'País',
                  opciones.paises.map((p) => ({ valor: String(p.id), etiqueta: p.nombre })),
                  false,
                  () => setValue('lugar.idProvincia', ''),
                )}
                {lista(
                  'lugar.idProvincia',
                  'Provincia',
                  opciones.provincias
                    .filter((p) => String(p.idPais) === pais)
                    .map((p) => ({
                      valor: String(p.id),
                      etiqueta: `${p.nombre}${p.eliminado ? ' (dada de baja)' : ''}`,
                    })),
                )}
                <TextField
                  label="Localidad"
                  maxLength={100}
                  error={errorCampo('lugar.localidad')}
                  {...register('lugar.localidad')}
                />
                <TextField
                  label="Calle y altura"
                  maxLength={150}
                  error={errorCampo('lugar.calle')}
                  {...register('lugar.calle')}
                />
                <TextField
                  label="Código postal"
                  maxLength={20}
                  error={errorCampo('lugar.codigoPostal')}
                  {...register('lugar.codigoPostal')}
                />
              </div>
            </BloqueFicha>
          </fieldset>
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t pt-4">{botones}</div>
        </PestanaFicha>
      </form>
    </>
  )
}
