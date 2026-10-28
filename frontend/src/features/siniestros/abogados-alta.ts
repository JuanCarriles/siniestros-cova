import { ROLES_ACCIDENTE } from '@cova/shared/schemas/siniestros-alta'
import type { AbogadoBorrador } from './borrador-alta'
import type { Involucrados } from './personas-alta'

// Paso 3 del alta (CU-09 pasos 23-27, E4-08): a quién representa cada abogado. Cada persona tiene a lo sumo un
// abogado; un abogado representa a una o varias personas del paso 2.

export type PersonaRepresentable = {
  clave: string
  /** Nombre o "Desconocido N" */
  nombre: string
  /** Qué es en el siniestro: "Titular", "Ocupante · Acompañante", "Testigo"… */
  detalle: string
  /** Dominio del vehículo en el que estaba, si iba en uno */
  dominio?: string
}
export type GrupoRepresentables = { titulo: string; personas: PersonaRepresentable[] }

const lugarDe = (p: { lugar?: string | null; lugarOtro?: string | null }) =>
  p.lugar === 'Otro' ? p.lugarOtro : p.lugar

/**
 * Las personas del alta para elegir a quién representa un abogado, agrupadas como en el paso 2. nombres: el de
 * cada persona por su clave ("Desconocido N" incluido), de nombresPersonas.
 */
export function gruposRepresentables(
  involucrados: Involucrados,
  nombres: Map<string, string>,
): GrupoRepresentables[] {
  const nombre = (clave: string) => nombres.get(clave) ?? ''
  const grupos: GrupoRepresentables[] = involucrados.vehiculos
    .map((v) => ({
      titulo: `Vehículo ${v.dominio} · ${ROLES_ACCIDENTE[v.rolAccidente]}`,
      personas: [
        ...(v.titular
          ? [
              {
                clave: v.titular.clave,
                nombre: nombre(v.titular.clave),
                detalle: 'Titular',
                dominio: v.dominio,
              },
            ]
          : []),
        ...v.ocupantes.map((o) => ({
          clave: o.clave,
          nombre: nombre(o.clave),
          detalle: ['Ocupante', lugarDe(o)].filter(Boolean).join(' · '),
          dominio: v.dominio,
        })),
      ],
    }))
    .filter((g) => g.personas.length > 0)
  if (involucrados.personasExternas.length > 0)
    grupos.push({
      titulo: 'Fuera de los vehículos',
      personas: involucrados.personasExternas.map((p) => ({
        clave: p.clave,
        nombre: nombre(p.clave),
        detalle: p.rolSinVehiculo,
      })),
    })
  return grupos
}

/** Cada persona de los grupos por su clave */
export function personasPorClave(grupos: GrupoRepresentables[]): Map<string, PersonaRepresentable> {
  return new Map(grupos.flatMap((g) => g.personas.map((p) => [p.clave, p])))
}

/** Quién representa hoy a cada persona (clave de la persona → abogado). */
export function representantes(abogados: AbogadoBorrador[]): Map<string, AbogadoBorrador> {
  return new Map(abogados.flatMap((a) => a.representados.map((c) => [c, a])))
}

/**
 * Saca de cada abogado a las personas que ya no están en el alta (se quitaron en el paso 2). Si no cambió nada,
 * devuelve la misma lista. Un abogado puede quedar sin representados: se marca hasta que se corrija.
 */
export function limpiarRepresentados(
  abogados: AbogadoBorrador[],
  involucrados: Involucrados,
): AbogadoBorrador[] {
  const presentes = new Set([
    ...involucrados.vehiculos.flatMap((v) => [
      ...(v.titular ? [v.titular.clave] : []),
      ...v.ocupantes.map((o) => o.clave),
    ]),
    ...involucrados.personasExternas.map((p) => p.clave),
  ])
  let cambio = false
  const limpios = abogados.map((a) => {
    const representados = a.representados.filter((c) => presentes.has(c))
    if (representados.length === a.representados.length) return a
    cambio = true
    return { ...a, representados }
  })
  return cambio ? limpios : abogados
}

/**
 * Agrega o modifica un abogado. Cada persona tiene un solo abogado: las que eligió dejan de estar en los demás.
 * Devuelve también de qué abogados se pasaron y cuántas, para avisarlo.
 */
export function guardarAbogado(
  abogados: AbogadoBorrador[],
  abogado: AbogadoBorrador,
): { abogados: AbogadoBorrador[]; pasadas: { abogado: string; cantidad: number }[] } {
  const elegidas = new Set(abogado.representados)
  const pasadas: { abogado: string; cantidad: number }[] = []
  const actualizados = abogados.map((a) => {
    if (a.clave === abogado.clave) return abogado
    const representados = a.representados.filter((c) => !elegidas.has(c))
    if (representados.length === a.representados.length) return a
    pasadas.push({
      abogado: a.nombreCompleto,
      cantidad: a.representados.length - representados.length,
    })
    return { ...a, representados }
  })
  const existe = abogados.some((a) => a.clave === abogado.clave)
  return { abogados: existe ? actualizados : [...actualizados, abogado], pasadas }
}
