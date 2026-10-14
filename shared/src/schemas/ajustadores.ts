import { z } from 'zod'
import { emailSchema, esquemaEdicion, idSchema, telefonoSchema, textoSchema } from './comunes.ts'

// Datos de alta de Ajustador; id y baja lógica se gestionan por separado.
export const ajustadorSchema = z.strictObject({
  nombres: textoSchema,
  apellidos: textoSchema,
  email: emailSchema,
  telefono: telefonoSchema,
  idAseguradora: idSchema,
})

export const ajustadorUpdateSchema = esquemaEdicion(ajustadorSchema)

export type AjustadorInput = z.input<typeof ajustadorSchema>
export type AjustadorData = z.output<typeof ajustadorSchema>
export type AjustadorUpdateInput = z.input<typeof ajustadorUpdateSchema>
export type AjustadorUpdateData = z.output<typeof ajustadorUpdateSchema>
