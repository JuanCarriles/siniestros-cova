import { z } from 'zod'
import { esquemaEdicion, textoSchema } from './comunes.ts'

// Datos de alta de Aseguradora; id y baja lógica se gestionan por separado.
export const aseguradoraSchema = z.strictObject({
  nombre: textoSchema.max(100, 'El nombre no puede superar los 100 caracteres'),
})

export const aseguradoraUpdateSchema = esquemaEdicion(aseguradoraSchema)

export type AseguradoraInput = z.input<typeof aseguradoraSchema>
export type AseguradoraData = z.output<typeof aseguradoraSchema>
export type AseguradoraUpdateInput = z.input<typeof aseguradoraUpdateSchema>
export type AseguradoraUpdateData = z.output<typeof aseguradoraUpdateSchema>
