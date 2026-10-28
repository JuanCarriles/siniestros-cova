import { useId, useState, type Ref } from 'react'
import { CircleCheck, UserCheck } from 'lucide-react'
import type { OpcionesAltaSiniestro } from '@cova/shared/schemas/siniestros-alta'
import { roleLabels } from '@/components/layout/panel-navigation'
import { TextField } from '@/components/text-field'
import { cn } from '@/lib/utils'

const sinTildes = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

// Paso 5 del alta (CU-09 paso 35, E4-10): a quién se le asigna el siniestro. Tarjetas con el rol y los casos
// activos de cada usuario, para repartir la carga. Obligatorio (35.a).
export function AsignacionAlta({
  usuarios,
  valor,
  onCambiar,
  error,
  grupoRef,
}: {
  usuarios: OpcionesAltaSiniestro['usuarios']
  valor: number | null
  onCambiar: (idUsuario: number) => void
  error: string | null
  /** Para llevar el foco al grupo cuando falta elegir */
  grupoRef?: Ref<HTMLFieldSetElement>
}) {
  const id = useId()
  const [busqueda, setBusqueda] = useState('')
  const maximo = Math.max(1, ...usuarios.map((u) => u.casosActivos))
  const buscado = sinTildes(busqueda.trim())
  // El elegido se sigue viendo aunque la búsqueda no lo incluya
  const visibles = usuarios.filter(
    (u) => !buscado || u.id === valor || sinTildes(u.nombre).includes(buscado),
  )

  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className="rounded-xl border bg-card p-5 shadow-card sm:p-6"
    >
      <div className="mb-5 grid gap-1">
        <h2 id={`${id}-titulo`} className="flex items-center gap-3 text-xl font-bold text-primary">
          <span
            className="grid size-10 place-items-center rounded-lg bg-callout-bg"
            aria-hidden="true"
          >
            <UserCheck className="size-5" />
          </span>
          Asignación
        </h2>
        <p className="text-muted-foreground">
          Quien lo reciba va a ver el aviso en el sistema y por mail. Los casos activos ayudan a
          repartir la carga.
        </p>
      </div>

      {usuarios.length > 6 && (
        <TextField
          label="Buscar por nombre"
          type="search"
          autoComplete="off"
          containerClassName="mb-4 max-w-md"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      )}

      <fieldset
        ref={grupoRef}
        tabIndex={-1}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={error ? true : undefined}
        className="grid gap-3 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        <legend className="mb-3 text-lg font-bold">
          ¿A quién se le asigna?{' '}
          <span className="text-base font-normal text-muted-foreground">(obligatorio)</span>
        </legend>
        {error && (
          <p id={`${id}-error`} role="alert" className="font-semibold text-destructive">
            {error}
          </p>
        )}
        {visibles.length === 0 ? (
          <p className="text-muted-foreground">Nadie coincide con «{busqueda}».</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibles.map((u) => {
              const elegido = u.id === valor
              return (
                <label
                  key={u.id}
                  className={cn(
                    'relative grid cursor-pointer gap-2 rounded-lg border-2 p-4 transition-colors focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-ring hover:bg-accent',
                    elegido ? 'border-primary bg-accent' : 'border-input bg-surface',
                    error && !valor && 'border-destructive',
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-asignado`}
                    checked={elegido}
                    onChange={() => onCambiar(u.id)}
                    className="sr-only"
                  />
                  <span className="flex items-start justify-between gap-2">
                    <span className="grid">
                      <span className="text-lg font-bold">{u.nombre}</span>
                      <span className="text-muted-foreground">{roleLabels[u.tipoUsuario]}</span>
                    </span>
                    <CircleCheck
                      className={cn(
                        'size-6 shrink-0',
                        elegido ? 'text-primary' : 'text-transparent',
                      )}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="grid gap-1">
                    <span>
                      <span className="dato text-xl font-bold">{u.casosActivos}</span>{' '}
                      {u.casosActivos === 1 ? 'caso activo' : 'casos activos'}
                    </span>
                    {/* La carga relativa a quien más casos tiene, a simple vista */}
                    <span
                      className="h-2 overflow-hidden rounded-full bg-neutral-bg"
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${(u.casosActivos / maximo) * 100}%` }}
                      />
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        )}
      </fieldset>
    </section>
  )
}
