import type { DireccionFicha } from '@cova/shared/schemas/ficha-siniestro'
import type { Prisma } from '../../generated/prisma/client.ts'

// Piezas comunes de la ficha del siniestro (CU-10) y sus pestañas.

export const selectDireccion = {
  localidad: true,
  calle: true,
  codigoPostal: true,
  provincia: { select: { nombre: true, pais: { select: { nombre: true } } } },
} as const satisfies Prisma.DireccionSelect

type FilaDireccion = Prisma.DireccionGetPayload<{ select: typeof selectDireccion }>

/** El país sale de la provincia: la dirección no lo guarda aparte */
export function aDireccion(d: FilaDireccion | null): DireccionFicha | null {
  if (!d) return null
  return {
    pais: d.provincia?.pais.nombre ?? null,
    provincia: d.provincia?.nombre ?? null,
    localidad: d.localidad,
    calle: d.calle,
    codigoPostal: d.codigoPostal,
  }
}

/** Columnas @db.Date: llegan a medianoche UTC, se devuelven como "aaaa-mm-dd" */
export const dia = (fecha: Date | null) => fecha?.toISOString().slice(0, 10) ?? null

/** Columnas @db.Time: llegan el 1/1/1970 en UTC, se devuelven como "hh:mm" */
export const hora = (fecha: Date | null) => fecha?.toISOString().slice(11, 16) ?? null

export const nombreDe = (p: { nombres: string; apellidos: string }) => `${p.nombres} ${p.apellidos}`

/** Sin nombre cargado queda null: cada pantalla decide cómo mostrarlo */
export const nombreOpcional = (p: { nombreCompletoRazonSocial: string | null }) =>
  p.nombreCompletoRazonSocial?.trim() || null
