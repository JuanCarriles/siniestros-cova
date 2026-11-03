import {
  normalizarDocumento,
  type OpcionesAltaSiniestro,
} from '@cova/shared/schemas/siniestros-alta'
import type { PersonaExternaBorrador, VehiculoBorrador } from './borrador-alta'

/** Todas las personas del paso 2: las de cada vehículo y las que no iban en ninguno (E4-06 y E4-07). */
export type Involucrados = {
  vehiculos: VehiculoBorrador[]
  personasExternas: PersonaExternaBorrador[]
}

/** Lo que hace falta de cada persona para nombrarla y detectar un documento repetido */
type PersonaClave = {
  clave: string
  documento?: string | null
  nombreCompletoRazonSocial?: string | null
}

/**
 * Las personas del siniestro reducidas a lo que usan el nombre y el aviso de documento repetido. En el alta son
 * las del borrador (Involucrados); en la ficha, las guardadas (E5-06).
 */
export type PersonasDelSiniestro = {
  vehiculos: { dominio: string; titular: PersonaClave | null; ocupantes: PersonaClave[] }[]
  personasExternas: (PersonaClave & { rolSinVehiculo: string | null })[]
}

// En el orden del alta: por vehículo, el titular y sus ocupantes; al final, las personas fuera de los vehículos.
// Dónde está cargada cada una, para el aviso de documento repetido.
function personasEnOrden({ vehiculos, personasExternas }: PersonasDelSiniestro) {
  return [
    ...vehiculos.flatMap((v) =>
      [
        v.titular && { persona: v.titular, donde: `titular del vehículo ${v.dominio}` },
        ...v.ocupantes.map((o) => ({ persona: o, donde: `ocupante del vehículo ${v.dominio}` })),
      ].filter((x) => !!x),
    ),
    ...personasExternas.map((p) => ({
      persona: p,
      donde: `persona fuera de los vehículos (${p.rolSinVehiculo ?? 'sin rol'})`,
    })),
  ]
}

/** Nombre a mostrar de cada persona. Sin nombre: "Desconocido 1", "Desconocido 2"… en el orden del alta. */
export function nombresPersonas(involucrados: PersonasDelSiniestro): Map<string, string> {
  const nombres = new Map<string, string>()
  let desconocidos = 0
  for (const { persona } of personasEnOrden(involucrados))
    nombres.set(persona.clave, persona.nombreCompletoRazonSocial ?? `Desconocido ${++desconocidos}`)
  return nombres
}

/**
 * Dónde está cargada otra persona con el mismo documento, sin contar puntos ni espacios. No se puede guardar: el
 * usuario corrige el documento o cancela la carga (CU-09 13.b y 16.a).
 */
export function documentoRepetido(
  involucrados: PersonasDelSiniestro,
  documento: string | null | undefined,
  claveActual: string | null,
): string | null {
  const buscado = normalizarDocumento(documento ?? '')
  if (!buscado) return null
  const otra = personasEnOrden(involucrados).find(
    ({ persona }) =>
      persona.clave !== claveActual &&
      !!persona.documento &&
      normalizarDocumento(persona.documento) === buscado,
  )
  return otra?.donde ?? null
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
