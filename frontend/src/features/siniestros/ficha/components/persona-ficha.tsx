import { useState } from 'react'
import { Eye, LogIn, LogOut } from 'lucide-react'
import type { PersonaFicha, PersonaVehiculoFicha } from '@cova/shared/schemas/ficha-siniestro'
import { GRAVEDADES_LESION } from '@cova/shared/schemas/siniestros-alta'
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
import { cn } from '@/lib/utils'
import { email, telefono } from '../../components/contacto'
import { Dato } from '../../components/dato'
import { dia, direccionDe, nombreDe } from '../formato'

/** Dónde aparece la persona: decide qué datos propios se muestran */
export type PersonaEnFicha =
  | { tipo: 'titular' | 'ocupante'; persona: PersonaVehiculoFicha; rol: string; vehiculo: string }
  | { tipo: 'fuera'; persona: PersonaFicha & { rolSinVehiculo: string | null }; rol: string }

/** El tipo puede ser largo ("Libreta Verde / Celeste") y se corta; el número, en una sola línea */
const documentoDe = (p: PersonaFicha) =>
  p.documento ? (
    <>
      {p.tipoDocumento && `${p.tipoDocumento} `}
      <span className="dato">{p.documento}</span>
    </>
  ) : null

/** Iba en el vehículo, y dónde; o el rol de quien no iba en ninguno */
function situacionDe(p: PersonaEnFicha) {
  if (p.tipo === 'fuera')
    return { texto: p.persona.rolSinVehiculo ?? 'Fuera de los vehículos', iba: null }
  const { persona } = p
  if (!persona.ibaEnVehiculo) return { texto: 'No iba en el vehículo', iba: false }
  const partes = [
    p.tipo === 'titular' ? 'Iba en el vehículo' : (persona.lugarEnVehiculo ?? 'Ocupante'),
    p.tipo === 'titular' ? persona.lugarEnVehiculo : persona.relacionTitular,
  ]
  return { texto: partes.filter(Boolean).join(' · '), iba: true }
}

function Lesion({ persona }: { persona: PersonaFicha }) {
  return persona.lesion ? (
    <p className="w-fit rounded-md border-2 border-injury-border bg-injury-bg px-2 font-semibold text-injury-ink">
      Lesiones: {GRAVEDADES_LESION[persona.lesion.tipo]}
    </p>
  ) : (
    <p className="text-muted-foreground">Sin lesiones</p>
  )
}

// Tarjeta de una persona del siniestro (CU-10 1.c): lo que se necesita a mano para llamarla o ubicarla, y el
// detalle completo en un modal
export function TarjetaPersonaFicha({
  persona: enFicha,
  onVerDetalle,
}: {
  persona: PersonaEnFicha
  onVerDetalle: (boton: HTMLElement) => void
}) {
  const { persona, rol } = enFicha
  const situacion = situacionDe(enFicha)
  const nombre = nombreDe(persona)
  const SituacionIcono = situacion.iba === false ? LogOut : LogIn
  return (
    <article className="grid content-start gap-2 rounded-lg border-2 border-line-strong bg-card p-4">
      <p
        className={cn(
          'w-fit rounded px-2 text-sm font-bold tracking-wide uppercase',
          rol === 'Asegurado'
            ? 'bg-owner-ink text-primary-foreground'
            : 'bg-neutral-bg text-neutral-ink',
        )}
      >
        {rol}
      </p>
      <h4 className={cn('text-lg font-bold', !persona.nombre && 'text-muted-foreground italic')}>
        {nombre}
      </h4>
      <p
        className={cn(
          'flex w-fit items-center gap-1.5 rounded-md px-2 font-semibold',
          situacion.iba === null
            ? 'bg-navy text-on-navy'
            : situacion.iba
              ? 'bg-ok-bg text-ok-ink'
              : 'border-2 border-dashed border-warning-ink text-warning-ink',
        )}
      >
        {situacion.iba !== null && <SituacionIcono className="size-4" aria-hidden="true" />}
        {situacion.texto}
      </p>
      <Lesion persona={persona} />
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3 border-t-2 border-line pt-3">
        <dl className="grid gap-0.5">
          {documentoDe(persona) && (
            <div>
              <dt className="sr-only">Documento</dt>
              <dd>{documentoDe(persona)}</dd>
            </div>
          )}
          {persona.telefono && (
            <div>
              <dt className="sr-only">Teléfono</dt>
              <dd>{telefono(persona.telefono)}</dd>
            </div>
          )}
          <div className="flex flex-wrap gap-x-1.5">
            <dt>Abogado:</dt>
            <dd className={persona.abogado ? 'font-semibold' : 'text-muted-foreground'}>
              {persona.abogado?.nombreCompleto ?? 'sin abogado'}
            </dd>
          </div>
        </dl>
        <Button
          variant="outline"
          onClick={(e) => onVerDetalle(e.currentTarget)}
          aria-label={`Ver detalle de ${nombre}`}
        >
          <Eye aria-hidden="true" />
          Ver detalle
        </Button>
      </div>
    </article>
  )
}

// Todos los datos de la persona (CU-10 1.c.8, 1.c.9 y 1.c.10) y el abogado que la representa
export function DetallePersonaDialog({
  persona: pedida,
  onCerrar,
  elementoAlCerrar,
}: {
  persona: PersonaEnFicha | null
  onCerrar: () => void
  elementoAlCerrar: () => HTMLElement | null
}) {
  // Mientras se cierra, sigue mostrando a la última persona (no queda vacío durante la animación)
  const [enFicha, setEnFicha] = useState(pedida)
  if (pedida && pedida !== enFicha) setEnFicha(pedida)
  const p = enFicha?.persona
  const titulo = {
    titular: 'Titular del vehículo',
    ocupante: 'Ocupante',
    fuera: 'Fuera de los vehículos',
  }
  return (
    <Dialog open={pedida !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent
        size="wide"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          elementoAlCerrar()?.focus()
        }}
      >
        {enFicha && p && (
          <>
            <DialogHeader>
              <DialogTitle>{nombreDe(p)}</DialogTitle>
              <DialogDescription>
                {[enFicha.rol, titulo[enFicha.tipo], 'vehiculo' in enFicha && enFicha.vehiculo]
                  .filter(Boolean)
                  .join(' · ')}
              </DialogDescription>
            </DialogHeader>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {enFicha.tipo === 'fuera' && (
                <Dato etiqueta="Rol en el siniestro">{enFicha.persona.rolSinVehiculo}</Dato>
              )}
              {enFicha.tipo === 'titular' && (
                <Dato etiqueta="¿Iba en el vehículo?">
                  {enFicha.persona.ibaEnVehiculo ? 'Sí' : 'No'}
                </Dato>
              )}
              {enFicha.tipo !== 'fuera' &&
                (enFicha.tipo === 'ocupante' || enFicha.persona.ibaEnVehiculo) && (
                  <Dato etiqueta="Lugar en el vehículo">{enFicha.persona.lugarEnVehiculo}</Dato>
                )}
              {enFicha.tipo === 'ocupante' && (
                <Dato etiqueta="Relación con el titular">{enFicha.persona.relacionTitular}</Dato>
              )}
              {enFicha.tipo === 'ocupante' && <Dato etiqueta="Vehículo">{enFicha.vehiculo}</Dato>}
              <Dato etiqueta="Nombre completo o razón social">{p.nombre}</Dato>
              <Dato etiqueta="Documento">{documentoDe(p)}</Dato>
              <Dato etiqueta="Estado civil">{p.estadoCivil}</Dato>
              <Dato etiqueta="Sexo">{p.sexo}</Dato>
              <Dato etiqueta="Fecha de nacimiento">
                {p.fechaNacimiento && <span className="dato">{dia(p.fechaNacimiento)}</span>}
              </Dato>
              {enFicha.tipo !== 'fuera' && (
                <>
                  <Dato etiqueta="Permiso de conducir">
                    {enFicha.persona.numeroPermisoConducir && (
                      <span className="dato">{enFicha.persona.numeroPermisoConducir}</span>
                    )}
                  </Dato>
                  <Dato etiqueta="Vencimiento del carnet">
                    {enFicha.persona.fechaVencimientoCarnet && (
                      <span className="dato">{dia(enFicha.persona.fechaVencimientoCarnet)}</span>
                    )}
                  </Dato>
                </>
              )}
              <Dato etiqueta="Teléfono">{telefono(p.telefono)}</Dato>
              <Dato etiqueta="Email">{email(p.email)}</Dato>
              <Dato etiqueta="Domicilio" ancho>
                {direccionDe(p.domicilio)}
              </Dato>
              <Dato etiqueta="Lesiones" ancho>
                {p.lesion ? (
                  <span className="grid gap-1">
                    <strong>{GRAVEDADES_LESION[p.lesion.tipo]}</strong>
                    {p.lesion.descripcion && (
                      <span className="whitespace-pre-line">{p.lesion.descripcion}</span>
                    )}
                  </span>
                ) : (
                  'Sin lesiones'
                )}
              </Dato>
              <Dato etiqueta="Abogado que la representa" ancho>
                {p.abogado?.nombreCompleto ?? 'Sin abogado'}
              </Dato>
            </dl>
            <DialogFooter>
              <DialogClose asChild>
                <Button>Cerrar</Button>
              </DialogClose>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
