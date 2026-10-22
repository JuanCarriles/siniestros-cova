import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LockKeyhole } from 'lucide-react'
import {
  perfilVerificarSchema,
  type AlcancePerfil,
  type PerfilVerificarData,
} from '@cova/shared/schemas/perfil'
import { PasswordField } from '@/components/password-field'
import { Aviso } from '@/components/aviso'
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
import { verificarPerfil } from '../api/perfil.api'

const esquema = perfilVerificarSchema
type DatosVerificacion = PerfilVerificarData

export function VerificarPerfilDialog({
  alcance,
  onCerrar,
  onVerificado,
}: {
  alcance: AlcancePerfil | null
  onCerrar: () => void
  onVerificado: (alcance: AlcancePerfil, contrasenaActual: string) => void
}) {
  const completada = useRef(false)
  const [escrituraHabilitada, setEscrituraHabilitada] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    resetField,
    setError,
    setFocus,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DatosVerificacion>({
    resolver: zodResolver(esquema),
    defaultValues: { contrasena: '' },
  })
  function habilitarEscritura() {
    if (escrituraHabilitada) return
    // Habilitar antes de la acción nativa para conservar la primera tecla o el pegado.
    flushSync(() => {
      setValue('contrasena', '')
      setEscrituraHabilitada(true)
    })
  }

  async function verificar(datos: DatosVerificacion) {
    if (!alcance) return
    try {
      await verificarPerfil(datos)
      completada.current = true
      reset()
      onVerificado(alcance, datos.contrasena)
    } catch (err) {
      setError('root', {
        message: err instanceof ApiError ? err.message : 'No se pudo verificar. Probá de nuevo.',
      })
    }
  }
  return (
    <Dialog
      open={alcance !== null}
      onOpenChange={(abrir) => {
        if (!abrir && !isSubmitting) {
          reset({ contrasena: '' })
          setEscrituraHabilitada(false)
          onCerrar()
        }
      }}
    >
      <DialogContent
        showCloseButton={!isSubmitting}
        onOpenAutoFocus={(e) => {
          completada.current = false
          setEscrituraHabilitada(false)
          resetField('contrasena', { defaultValue: '' })
          e.preventDefault()
          setFocus('contrasena')
        }}
        onCloseAutoFocus={(e) => {
          if (completada.current) {
            e.preventDefault()
            document
              .getElementById(
                alcance === 'contrasena' ? 'perfil-nueva-contrasena' : 'perfil-nombres',
              )
              ?.focus()
          }
        }}
      >
        <DialogHeader>
          <span className="grid size-12 place-items-center rounded-full bg-accent text-primary">
            <LockKeyhole aria-hidden="true" />
          </span>
          <DialogTitle>Confirmá que sos vos</DialogTitle>
          <DialogDescription>
            Ingresá tu contraseña actual para{' '}
            {alcance === 'contrasena'
              ? 'cambiar la contraseña de tu cuenta'
              : 'habilitar la edición de tus datos personales'}
            .
          </DialogDescription>
        </DialogHeader>
        <form
          autoComplete="off"
          noValidate
          onSubmit={(e) => void handleSubmit(verificar)(e)}
          className="grid gap-5"
        >
          {errors.root?.message && (
            <Aviso tipo="error" enfocar>
              {errors.root.message}
            </Aviso>
          )}
          <PasswordField
            label="Contraseña actual"
            required
            autoComplete="off"
            // El navegador puede ignorar autocomplete="off". El foco automático no
            // habilita la escritura: se requiere un clic, una tecla o pegar texto.
            readOnly={!escrituraHabilitada}
            onPointerDown={habilitarEscritura}
            onKeyDown={(event) => {
              if (
                event.key.length === 1 ||
                ['Backspace', 'Delete', 'Process', 'Unidentified'].includes(event.key)
              ) {
                habilitarEscritura()
              }
            }}
            onPaste={habilitarEscritura}
            maxLength={128}
            error={errors.contrasena?.message}
            {...register('contrasena')}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={isSubmitting}>
              Continuar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
