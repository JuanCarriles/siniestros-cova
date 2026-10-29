import type { TipoPerito } from '@cova/shared/schemas/enums'
import type { PeritoBorrador } from './borrador-alta'

// Paso 4 del alta (CU-09 pasos 28-31, E4-09): un perito CESVI y uno médico como máximo.

/** Orden en que se muestran y se guardan */
export const ORDEN_PERITOS: TipoPerito[] = ['CESVI', 'MEDICO']

/** Carga o reemplaza el perito de su tipo: nunca quedan dos del mismo. */
export function ponerPerito(peritos: PeritoBorrador[], perito: PeritoBorrador): PeritoBorrador[] {
  return ORDEN_PERITOS.map((tipo) =>
    tipo === perito.tipoPerito ? perito : (peritos.find((p) => p.tipoPerito === tipo) ?? null),
  ).filter((p) => p !== null)
}
