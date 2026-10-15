import { z } from 'zod'
import { esquemaEdicion, fechaHoraSchema, idSchema, textoSchema } from './comunes.ts'

// Datos de alta de NovedadSiniestro; id y baja lógica se gestionan por separado.
export const novedadSiniestroSchema = z.strictObject({
  descripcion: textoSchema,
  // Nombre y apellido del usuario asignado al siniestro al cargarla (texto, no FK). Lo completa el backend.
  autor: textoSchema,
  fechaCarga: fechaHoraSchema.optional(),
  idSiniestro: idSchema,
})

export const novedadSiniestroUpdateSchema = esquemaEdicion(novedadSiniestroSchema)

export type NovedadSiniestroInput = z.input<typeof novedadSiniestroSchema>
export type NovedadSiniestroData = z.output<typeof novedadSiniestroSchema>
export type NovedadSiniestroUpdateInput = z.input<typeof novedadSiniestroUpdateSchema>
export type NovedadSiniestroUpdateData = z.output<typeof novedadSiniestroUpdateSchema>
