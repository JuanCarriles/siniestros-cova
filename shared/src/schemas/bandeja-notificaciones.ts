import { z } from 'zod'
import { idSchema } from './comunes.ts'

export const consultaNotificacionesSchema = z.strictObject({ pagina: idSchema.default(1) })
export const bandejaNotificacionesSchema = z.strictObject({
  total: z.int().nonnegative(),
  sinLeer: z.int().nonnegative(),
  pagina: z.int().positive(),
  porPagina: z.literal(20),
  items: z.array(
    z.strictObject({
      id: z.int().positive(),
      mensaje: z.string(),
      fecha: z.iso.datetime(),
      leida: z.boolean(),
      puedeAbrirSiniestro: z.boolean(),
      siniestro: z.strictObject({ id: z.int().positive(), numeroSiniestro: z.string() }),
    }),
  ),
})
export type BandejaNotificaciones = z.output<typeof bandejaNotificacionesSchema>
