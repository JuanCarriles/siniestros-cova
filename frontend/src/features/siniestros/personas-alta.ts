import {
  normalizarDocumento,
  type OpcionesAltaSiniestro,
} from '@cova/shared/schemas/siniestros-alta'
import type { VehiculoBorrador } from './borrador-alta'

// Personas del paso 2 del alta (E4-06), en el orden en que aparecen: por vehículo, el titular y sus ocupantes.
function personasEnOrden(vehiculos: VehiculoBorrador[]) {
  return vehiculos.flatMap((v) =>
    [
      v.titular && { persona: v.titular, rol: 'titular', vehiculo: v },
      ...v.ocupantes.map((o) => ({ persona: o, rol: 'ocupante', vehiculo: v })),
    ].filter((x) => !!x),
  )
}

/** Nombre a mostrar de cada persona. Sin nombre: "Desconocido 1", "Desconocido 2"… en el orden del alta. */
export function nombresPersonas(vehiculos: VehiculoBorrador[]): Map<string, string> {
  const nombres = new Map<string, string>()
  let desconocidos = 0
  for (const { persona } of personasEnOrden(vehiculos))
    nombres.set(persona.clave, persona.nombreCompletoRazonSocial ?? `Desconocido ${++desconocidos}`)
  return nombres
}

/**
 * Dónde está cargada otra persona con el mismo documento, sin contar puntos ni espacios. No se puede guardar: el
 * usuario corrige el documento o cancela la carga (CU-09 13.b y 16.a).
 */
export function documentoRepetido(
  vehiculos: VehiculoBorrador[],
  documento: string | null | undefined,
  claveActual: string | null,
): string | null {
  const buscado = normalizarDocumento(documento ?? '')
  if (!buscado) return null
  const otra = personasEnOrden(vehiculos).find(
    ({ persona }) =>
      persona.clave !== claveActual &&
      !!persona.documento &&
      normalizarDocumento(persona.documento) === buscado,
  )
  return otra ? `${otra.rol} del vehículo ${otra.vehiculo.dominio}` : null
}

/**
 * País a mostrar en el domicilio de una persona. La dirección guarda la provincia, no el país: con provincia, el
 * de ella; sin provincia, el único país disponible (si hay más de uno, queda para elegir).
 */
export function paisDelDomicilio(
  idProvincia: number | null | undefined,
  { paises, provincias }: Pick<OpcionesAltaSiniestro, 'paises' | 'provincias'>,
): string {
  const provincia = provincias.find((p) => p.id === idProvincia)
  if (provincia) return String(provincia.idPais)
  return paises.length === 1 ? String(paises[0].id) : ''
}
