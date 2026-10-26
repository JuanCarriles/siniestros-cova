import { z } from 'zod'
import { idSchema, textoSchema } from './comunes.ts'

export const SINIESTROS_ASOCIADOS_POR_PAGINA = 5
export const consultaSiniestrosAsociadosSchema = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(1_000_000).default(1),
})
export const siniestrosActivosAsociadosSchema = z.strictObject({
  casosActivos: z.number().int().nonnegative(),
  pagina: z.number().int().positive(),
  porPagina: z.literal(SINIESTROS_ASOCIADOS_POR_PAGINA),
  siniestros: z
    .array(
      z.strictObject({
        id: idSchema,
        numeroSiniestro: textoSchema,
        aseguradora: textoSchema,
        estado: textoSchema,
      }),
    )
    .max(SINIESTROS_ASOCIADOS_POR_PAGINA),
})
export type SiniestrosActivosAsociados = z.output<typeof siniestrosActivosAsociadosSchema>
