import { boolean, z } from 'zod'
import { booleanoSchema, esquemaEdicion, textoSchema } from './comunes.ts'

// Datos de alta de EstadoSiniestro; id y baja lógica se gestionan por separado.
export const estadoSiniestroSchema = z.strictObject({
  nombre: textoSchema,
  descripcion: textoSchema,
  esCierre: booleanoSchema,
})

export const estadoSiniestroUpdateSchema = esquemaEdicion(estadoSiniestroSchema)

export type EstadoSiniestroInput = z.input<typeof estadoSiniestroSchema>
export type EstadoSiniestroData = z.output<typeof estadoSiniestroSchema>
export type EstadoSiniestroUpdateInput = z.input<typeof estadoSiniestroUpdateSchema>
export type EstadoSiniestroUpdateData = z.output<typeof estadoSiniestroUpdateSchema>
