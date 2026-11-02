import { useState } from 'react'
import { Car, Eye, KeyRound, LogIn, Pencil, Trash2, UserPlus, UsersRound } from 'lucide-react'
import type { VehiculoFicha } from '@cova/shared/schemas/ficha-siniestro'
import { ROLES_ACCIDENTE, USOS_VEHICULO } from '@cova/shared/schemas/siniestros-alta'
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
import { plural } from '@/lib/texto'
import { cn } from '@/lib/utils'
import { Dato } from '../../components/dato'
import { Patente } from '../../components/patente'
import { descripcionVehiculo, nombreDe } from '../formato'
import { TarjetaPersonaFicha, type PersonaEnFicha } from './persona-ficha'

const personasDe = (v: VehiculoFicha) => (v.titular ? 1 : 0) + v.ocupantes.length

/** Lo que se puede hacer con el vehículo y sus personas (E5-06). Sin acciones, la tarjeta es de solo lectura. */
export type AccionesVehiculo = {
  onModificar: (boton: HTMLElement) => void
  onDarDeBaja: (boton: HTMLElement) => void
  onAgregarPersona: (modo: 'titular' | 'ocupante', boton: HTMLElement) => void
  onModificarPersona: (persona: PersonaEnFicha, boton: HTMLElement) => void
  onDarDeBajaPersona: (persona: PersonaEnFicha, boton: HTMLElement) => void
}

// Botón sobre la franja oscura del vehículo
const botonEnFranja =
  'border-on-navy bg-transparent text-on-navy hover:bg-navy-hover hover:text-on-navy'

// Un vehículo del siniestro (CU-10 1.c): sus datos principales en la franja de arriba, después el titular y los
// ocupantes. El asegurado se distingue por el color de su rol, como en el alta. Con acciones (CU-10 1.c.1 a 1.c.6),
// cada bloque tiene sus botones: el vehículo arriba, el titular y los ocupantes en su lugar.
export function TarjetaVehiculo({
  vehiculo: v,
  titulo,
  onVerVehiculo,
  onVerPersona,
  acciones,
}: {
  vehiculo: VehiculoFicha
  titulo: string
  onVerVehiculo: (boton: HTMLElement) => void
  onVerPersona: (persona: PersonaEnFicha, boton: HTMLElement) => void
  acciones?: AccionesVehiculo
}) {
  const asegurado = v.rolAccidente === 'ASEGURADO'
  const rol = v.rolAccidente ? ROLES_ACCIDENTE[v.rolAccidente] : 'Sin rol'
  const vehiculo = `${descripcionVehiculo(v)} (${v.dominio})`
  // Como en el listado: asegurado es solo el titular del vehículo asegurado; todos los demás son terceros
  const rolTitular = asegurado ? 'Asegurado' : 'Tercero'
  const titularIba = v.titular?.ibaEnVehiculo ? v.titular : null
  const enFichaTitular: PersonaEnFicha | null = v.titular && {
    tipo: 'titular',
    persona: v.titular,
    rol: rolTitular,
    vehiculo,
  }
  return (
    <article
      aria-label={`${titulo}: ${vehiculo}`}
      className={cn(
        'overflow-hidden rounded-xl border-2 shadow-card',
        asegurado ? 'border-owner-ink' : 'border-navy',
      )}
    >
      <header className="grid gap-4 bg-navy p-5 text-on-navy">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2.5 text-xl font-bold">
            <span
              className={cn(
                'rounded px-2 text-sm font-bold tracking-wide uppercase',
                asegurado ? 'bg-owner-bg text-owner-ink' : 'bg-on-navy text-navy',
              )}
            >
              {rol}
            </span>
            {titulo}
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className={botonEnFranja}
              onClick={(e) => onVerVehiculo(e.currentTarget)}
              aria-label={`Ver detalle del vehículo ${v.dominio}`}
            >
              <Eye aria-hidden="true" />
              Ver detalle
            </Button>
            {acciones && (
              <>
                <Button
                  variant="outline"
                  className={botonEnFranja}
                  onClick={(e) => acciones.onModificar(e.currentTarget)}
                  aria-label={`Modificar el vehículo ${v.dominio}`}
                >
                  <Pencil aria-hidden="true" />
                  Modificar
                </Button>
                <Button
                  variant="outline"
                  className={botonEnFranja}
                  onClick={(e) => acciones.onDarDeBaja(e.currentTarget)}
                  aria-label={`Dar de baja el vehículo ${v.dominio}`}
                >
                  <Trash2 aria-hidden="true" />
                  Dar de baja
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-2xl font-bold">{descripcionVehiculo(v)}</p>
          <Patente dominio={v.dominio} />
        </div>
        {v.version && <p className="-mt-2 text-on-navy-muted">{v.version}</p>}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-on-navy-muted/40 pt-3 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-on-navy-muted">Aseguradora</dt>
            <dd className="font-bold">{v.aseguradora ?? 'Sin dato'}</dd>
          </div>
          <div>
            <dt className="text-sm text-on-navy-muted">Uso</dt>
            <dd className="font-bold">{v.uso ? USOS_VEHICULO[v.uso] : 'Sin dato'}</dd>
          </div>
          <div>
            <dt className="text-sm text-on-navy-muted">Personas</dt>
            <dd className="font-bold">{plural(personasDe(v), 'persona')}</dd>
          </div>
        </dl>
      </header>

      <section className="border-b-2 border-owner-border bg-owner-bg">
        <h4 className="flex items-center gap-2 border-l-8 border-owner-ink px-4 py-2.5 text-lg font-bold text-owner-ink">
          <KeyRound className="size-5" aria-hidden="true" />
          Titular del vehículo
        </h4>
        <div className="p-4 pt-0">
          {enFichaTitular ? (
            <TarjetaPersonaFicha
              persona={enFichaTitular}
              onVerDetalle={(boton) => onVerPersona(enFichaTitular, boton)}
              acciones={
                acciones && {
                  onModificar: (boton) => acciones.onModificarPersona(enFichaTitular, boton),
                  onDarDeBaja: (boton) => acciones.onDarDeBajaPersona(enFichaTitular, boton),
                }
              }
            />
          ) : (
            <div className="grid justify-items-start gap-3 rounded-lg border-2 border-dashed border-owner-border bg-card p-4">
              <p className="text-muted-foreground">El titular no está identificado.</p>
              {acciones && (
                <Button
                  variant="outline"
                  onClick={(e) => acciones.onAgregarPersona('titular', e.currentTarget)}
                  aria-label={`Agregar titular del vehículo ${v.dominio}`}
                >
                  <UserPlus aria-hidden="true" />
                  Agregar titular
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="bg-card">
        <h4 className="flex items-center gap-2 border-l-8 border-navy bg-info-bg px-4 py-2.5 text-lg font-bold text-info-ink">
          <UsersRound className="size-5" aria-hidden="true" />
          Ocupantes al momento del hecho
          <span className="rounded-full bg-navy px-2 dato text-sm text-on-navy">
            {v.ocupantes.length + (titularIba ? 1 : 0)}
          </span>
        </h4>
        <div className="grid gap-3 p-4">
          {titularIba && (
            <p className="flex items-start gap-2 rounded-lg border-2 border-dashed border-line-strong p-3">
              <LogIn className="mt-1 size-4 shrink-0 text-ok-ink" aria-hidden="true" />
              <span>
                <strong>{nombreDe(titularIba)}</strong> (titular) también iba
                {titularIba.lugarEnVehiculo ? `: ${titularIba.lugarEnVehiculo.toLowerCase()}` : ''}.
              </span>
            </p>
          )}
          {v.ocupantes.map((o) => {
            const enFicha: PersonaEnFicha = {
              tipo: 'ocupante',
              persona: o,
              rol: 'Tercero',
              vehiculo,
            }
            return (
              <TarjetaPersonaFicha
                key={o.id}
                persona={enFicha}
                onVerDetalle={(boton) => onVerPersona(enFicha, boton)}
                acciones={
                  acciones && {
                    onModificar: (boton) => acciones.onModificarPersona(enFicha, boton),
                    onDarDeBaja: (boton) => acciones.onDarDeBajaPersona(enFicha, boton),
                  }
                }
              />
            )
          })}
          {v.ocupantes.length === 0 && !titularIba && (
            <p className="text-muted-foreground">No hay ocupantes cargados.</p>
          )}
          {acciones && (
            <Button
              variant="outline"
              className="justify-self-start"
              onClick={(e) => acciones.onAgregarPersona('ocupante', e.currentTarget)}
              aria-label={`Agregar ocupante del vehículo ${v.dominio}`}
            >
              <UserPlus aria-hidden="true" />
              Agregar ocupante
            </Button>
          )}
        </div>
      </section>
    </article>
  )
}

// Todos los datos del vehículo (CU-10 1.c.7), con su titular y sus ocupantes
export function DetalleVehiculoDialog({
  vehiculo: pedido,
  titulos,
  onCerrar,
  elementoAlCerrar,
}: {
  vehiculo: VehiculoFicha | null
  /** "Vehículo tercero 2", por id */
  titulos: Map<number, string>
  onCerrar: () => void
  elementoAlCerrar: () => HTMLElement | null
}) {
  // Mientras se cierra, sigue mostrando el último vehículo
  const [v, setV] = useState(pedido)
  if (pedido && pedido !== v) setV(pedido)
  return (
    <Dialog open={pedido !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent
        size="wide"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          elementoAlCerrar()?.focus()
        }}
      >
        {v && (
          <>
            <DialogHeader className="flex-row items-center gap-4 text-left">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-info-bg text-info-ink">
                <Car className="size-6" aria-hidden="true" />
              </span>
              <div className="grid gap-1">
                <DialogTitle>{descripcionVehiculo(v)}</DialogTitle>
                <DialogDescription>
                  {titulos.get(v.id)} · <span className="dato">{v.dominio}</span>
                </DialogDescription>
              </div>
            </DialogHeader>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Dato etiqueta="Rol en el accidente">
                {v.rolAccidente && ROLES_ACCIDENTE[v.rolAccidente]}
              </Dato>
              <Dato etiqueta="Dominio">
                <span className="dato">{v.dominio}</span>
              </Dato>
              <Dato etiqueta="Marca">{v.marca}</Dato>
              <Dato etiqueta="Modelo">{v.modelo}</Dato>
              <Dato etiqueta="Versión">{v.version}</Dato>
              <Dato etiqueta="Año">{v.anio && <span className="dato">{v.anio}</span>}</Dato>
              <Dato etiqueta="Número de chasis">
                {v.numeroChasis && <span className="dato">{v.numeroChasis}</span>}
              </Dato>
              <Dato etiqueta="Número de motor">
                {v.numeroMotor && <span className="dato">{v.numeroMotor}</span>}
              </Dato>
              <Dato etiqueta="Uso del vehículo">{v.uso && USOS_VEHICULO[v.uso]}</Dato>
              <Dato etiqueta="Tipo / estilo">{v.tipo}</Dato>
              <Dato etiqueta="Color">{v.color}</Dato>
              <Dato etiqueta="Aseguradora">{v.aseguradora}</Dato>
              <Dato etiqueta="Acreedor prendario" ancho>
                {v.acreedorPrendario}
              </Dato>
              <Dato etiqueta="Daños del vehículo" ancho>
                {v.descripcionDanos && (
                  <span className="whitespace-pre-line">{v.descripcionDanos}</span>
                )}
              </Dato>
              <Dato etiqueta="Titular" ancho>
                {v.titular
                  ? `${nombreDe(v.titular)}${
                      v.titular.ibaEnVehiculo
                        ? ` · iba en el vehículo${v.titular.lugarEnVehiculo ? ` (${v.titular.lugarEnVehiculo})` : ''}`
                        : ' · no iba en el vehículo'
                    }`
                  : 'Sin identificar'}
              </Dato>
              <Dato etiqueta="Ocupantes" ancho>
                {v.ocupantes.length > 0 ? (
                  <ul className="grid gap-1">
                    {v.ocupantes.map((o) => (
                      <li key={o.id}>
                        {nombreDe(o)}
                        {o.lugarEnVehiculo && ` · ${o.lugarEnVehiculo}`}
                      </li>
                    ))}
                  </ul>
                ) : (
                  'Sin ocupantes cargados'
                )}
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
