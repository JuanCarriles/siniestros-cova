import { z } from 'zod'
import { esquemaEdicion, idSchema, textoSchema } from './comunes.ts'

// Datos de alta de Provincia; id y baja lógica se gestionan por separado.
export const provinciaSchema = z.strictObject({
  nombre: textoSchema,
  idPais: idSchema,
})

export const provinciaUpdateSchema = esquemaEdicion(provinciaSchema)

export type ProvinciaInput = z.input<typeof provinciaSchema>
export type ProvinciaData = z.output<typeof provinciaSchema>
export type ProvinciaUpdateInput = z.input<typeof provinciaUpdateSchema>
export type ProvinciaUpdateData = z.output<typeof provinciaUpdateSchema>
