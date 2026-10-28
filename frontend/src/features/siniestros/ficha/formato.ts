import type { DireccionFicha, VehiculoFicha } from '@cova/shared/schemas/ficha-siniestro'

// Cómo se muestran los datos de la ficha: fechas dd/mm/aaaa, nombres, direcciones y vehículos

const fecha = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const fechaHora = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Un día guardado como "aaaa-mm-dd" (sin hora): se da vuelta el texto, sin pasar por zonas horarias */
export function dia(valor: string | null): string | null {
  if (!valor) return null
  const [anio, mes, d] = valor.split('-')
  return `${d}/${mes}/${anio}`
}

/** Un momento (ISO): la fecha en la hora local */
export const fechaDe = (iso: string) => fecha.format(new Date(iso))

/** Un momento (ISO): "03/02/2026, 18:40", en 24 horas */
export const fechaHoraDe = (iso: string) => fechaHora.format(new Date(iso))

/** Quien se cargó sin nombre */
export const nombreDe = (p: { nombre: string | null }) => p.nombre ?? 'Sin nombre'

export const direccionDe = (d: DireccionFicha | null) =>
  d
    ? [d.calle, d.localidad, d.provincia, d.pais, d.codigoPostal && `CP ${d.codigoPostal}`]
        .filter(Boolean)
        .join(', ') || null
    : null

/** "Ford Ranger 2019" */
export const descripcionVehiculo = (v: VehiculoFicha) =>
  [v.marca, v.modelo, v.anio].filter(Boolean).join(' ') || 'Vehículo sin marca ni modelo'

/** "Vehículo asegurado" / "Vehículo tercero 2" */
export function tituloVehiculo(v: VehiculoFicha, numeroTercero: number) {
  if (v.rolAccidente === 'ASEGURADO') return 'Vehículo asegurado'
  if (v.rolAccidente === 'TERCERO') return `Vehículo tercero ${numeroTercero}`
  return 'Vehículo sin rol'
}
