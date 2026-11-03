import { DIAS_DEMORADO } from '@cova/shared/schemas/siniestros'
import type { Prisma } from '../../generated/prisma/client.ts'

const DIA_MS = 86_400_000

/**
 * RF-19 (E5-10): sin movimiento hace `dias` días o más (72 horas para "demorado"). La demora no se guarda: se
 * calcula al consultar, desde la fecha de último movimiento, que se escribe cuando el caso se mueve (cambio de
 * estado, novedad, documento o cierre de pericia; ver registrarMovimiento). Sin movimientos, cuenta desde la
 * asignación. Combinarlo con AND: los listados ya traen su propio OR (la búsqueda).
 *
 * Lo usan el listado, los dos dashboards, el perfil y la tarea que avisa de las demoras: todos con el mismo umbral.
 */
export function sinMovimiento(ahora: Date, dias: number = DIAS_DEMORADO) {
  const limite = limiteDemora(ahora, dias)
  return {
    OR: [
      { fechaUltimoMovimiento: { lte: limite } },
      { fechaUltimoMovimiento: null, fechaAsignacion: { lte: limite } },
    ],
  } satisfies Prisma.SiniestroWhereInput
}

/** Desde cuándo un caso sin movimiento cuenta como demorado: `dias` días antes de `ahora` (para SQL directo) */
export const limiteDemora = (ahora: Date, dias: number = DIAS_DEMORADO) =>
  new Date(ahora.getTime() - dias * DIA_MS)

/** Días enteros sin movimiento (desde el último o, si no hubo, desde la asignación) */
export const diasSinMovimiento = (
  ahora: Date,
  caso: { fechaUltimoMovimiento: Date | null; fechaAsignacion: Date },
) =>
  Math.max(
    0,
    Math.floor(
      (ahora.getTime() - (caso.fechaUltimoMovimiento ?? caso.fechaAsignacion).getTime()) / DIA_MS,
    ),
  )
