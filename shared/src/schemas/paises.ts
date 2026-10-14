import { z } from 'zod'
import { esquemaEdicion, textoSchema } from './comunes.ts'

// Datos de alta de Pais; id y baja lógica se gestionan por separado.
export const paisSchema = z.strictObject({
  nombre: textoSchema,
})

export const paisUpdateSchema = esquemaEdicion(paisSchema)

export type PaisInput = z.input<typeof paisSchema>
export type PaisData = z.output<typeof paisSchema>
export type PaisUpdateInput = z.input<typeof paisUpdateSchema>
export type PaisUpdateData = z.output<typeof paisUpdateSchema>
