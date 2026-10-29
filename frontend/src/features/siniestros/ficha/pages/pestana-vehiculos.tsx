import { useRef, useState } from 'react'
import { Car, UsersRound } from 'lucide-react'
import type { VehiculoFicha } from '@cova/shared/schemas/ficha-siniestro'
import { PestanaFicha, PestanaVacia } from '../components/pestana-ficha'
import {
  DetallePersonaDialog,
  TarjetaPersonaFicha,
  type PersonaEnFicha,
} from '../components/persona-ficha'
import { DetalleVehiculoDialog, TarjetaVehiculo } from '../components/vehiculo-ficha'
import { tituloVehiculo } from '../formato'
import { usePestana } from '../hooks/use-ficha'

// Pestaña "Vehículos y partes" (CU-10 1.c y 1.c.7 a 1.c.10): cada vehículo con su titular y sus ocupantes, y aparte
// las personas que no iban en ninguno. "Ver detalle" muestra todos los datos.
export function PestanaVehiculos() {
  const { vehiculos, personasFuera } = usePestana<'vehiculos'>()
  const [vehiculo, setVehiculo] = useState<VehiculoFicha | null>(null)
  const [persona, setPersona] = useState<PersonaEnFicha | null>(null)
  const volverA = useRef<HTMLElement | null>(null)

  // El asegurado viene primero; los terceros se numeran en orden de carga
  let terceros = 0
  const titulos = new Map(
    vehiculos.map((v) => [v.id, tituloVehiculo(v, v.rolAccidente === 'TERCERO' ? ++terceros : 0)]),
  )
  const verPersona = (p: PersonaEnFicha, boton: HTMLElement) => {
    volverA.current = boton
    setPersona(p)
  }

  return (
    <PestanaFicha titulo="Partes involucradas">
      {vehiculos.length === 0 && personasFuera.length === 0 ? (
        <PestanaVacia icono={Car}>
          Este siniestro no tiene vehículos ni personas cargadas.
        </PestanaVacia>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          {vehiculos.map((v) => (
            <TarjetaVehiculo
              key={v.id}
              vehiculo={v}
              titulo={titulos.get(v.id) ?? ''}
              onVerVehiculo={(boton) => {
                volverA.current = boton
                setVehiculo(v)
              }}
              onVerPersona={verPersona}
            />
          ))}

          <section
            aria-labelledby="personas-fuera"
            className="overflow-hidden rounded-xl border-2 border-line-strong bg-surface-subtle shadow-card"
          >
            <h3
              id="personas-fuera"
              className="flex items-center gap-2.5 border-b-2 border-line-strong bg-table-head px-5 py-4 text-xl font-bold text-table-head-foreground"
            >
              <UsersRound className="size-6 shrink-0" aria-hidden="true" />
              Peatones, testigos, dueños de propiedad, etc.
            </h3>
            <div className="grid gap-3 p-4">
              {personasFuera.map((p) => {
                const enFicha: PersonaEnFicha = { tipo: 'fuera', persona: p, rol: 'Tercero' }
                return (
                  <TarjetaPersonaFicha
                    key={p.id}
                    persona={enFicha}
                    onVerDetalle={(boton) => verPersona(enFicha, boton)}
                  />
                )
              })}
              {personasFuera.length === 0 && (
                <p className="text-muted-foreground">
                  No hay personas fuera de los vehículos cargadas.
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      <DetalleVehiculoDialog
        vehiculo={vehiculo}
        titulos={titulos}
        onCerrar={() => setVehiculo(null)}
        elementoAlCerrar={() => volverA.current}
      />
      <DetallePersonaDialog
        persona={persona}
        onCerrar={() => setPersona(null)}
        elementoAlCerrar={() => volverA.current}
      />
    </PestanaFicha>
  )
}
