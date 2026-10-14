import { z } from 'zod'
import { esquemaEdicion, idSchema, textoSchema } from './comunes.ts'

// Datos de alta de NovedadSiniestro; id y baja lógica se gestionan por separado.
export const novedadSiniestroSchema = z.strictObject({
  descripcion: textoSchema,
  idSiniestro: idSchema,
})

export const novedadSiniestroUpdateSchema = esquemaEdicion(novedadSiniestroSchema)

export type NovedadSiniestroInput = z.input<typeof novedadSiniestroSchema>
export type NovedadSiniestroData = z.output<typeof novedadSiniestroSchema>
export type NovedadSiniestroUpdateInput = z.input<typeof novedadSiniestroUpdateSchema>
export type NovedadSiniestroUpdateData = z.output<typeof novedadSiniestroUpdateSchema>
