import { z } from 'zod'
import { esquemaEdicion, idSchema, opcional, textoSchema } from './comunes.ts'

// Datos de alta de Direccion; id y baja lógica se gestionan por separado.
export const direccionSchema = z.strictObject({
  localidad: opcional(textoSchema),
  calle: opcional(textoSchema),
  pisoDepartamento: opcional(textoSchema),
  codigoPostal: opcional(textoSchema),
  idProvincia: opcional(idSchema),
})

export const direccionUpdateSchema = esquemaEdicion(direccionSchema)

export type DireccionInput = z.input<typeof direccionSchema>
export type DireccionData = z.output<typeof direccionSchema>
export type DireccionUpdateInput = z.input<typeof direccionUpdateSchema>
export type DireccionUpdateData = z.output<typeof direccionUpdateSchema>
