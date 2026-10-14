import { z } from 'zod'
import { esquemaEdicion, fechaHoraSchema, idSchema, textoSchema } from './comunes.ts'
import { tipoEventoHistorialSchema } from './enums.ts'

// Datos de alta de HistorialSiniestro; id y baja lógica se gestionan por separado.
export const historialSiniestroSchema = z.strictObject({
  tipoEvento: tipoEventoHistorialSchema,
  descripcion: textoSchema,
  fechaEvento: fechaHoraSchema.optional(),
  idSiniestro: idSchema,
  idUsuario: idSchema,
})

export const historialSiniestroUpdateSchema = esquemaEdicion(historialSiniestroSchema)

export type HistorialSiniestroInput = z.input<typeof historialSiniestroSchema>
export type HistorialSiniestroData = z.output<typeof historialSiniestroSchema>
export type HistorialSiniestroUpdateInput = z.input<typeof historialSiniestroUpdateSchema>
export type HistorialSiniestroUpdateData = z.output<typeof historialSiniestroUpdateSchema>
