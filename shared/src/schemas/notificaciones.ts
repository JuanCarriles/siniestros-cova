import { z } from 'zod'
import { booleanoSchema, esquemaEdicion, fechaHoraSchema, idSchema, textoSchema } from './comunes.ts'
import { tipoNotificacionSchema } from './enums.ts'

// Datos de alta de Notificacion; id y baja lógica se gestionan por separado.
export const notificacionSchema = z.strictObject({
  mensaje: textoSchema,
  leida: booleanoSchema,
  revisada: booleanoSchema,
  fechaCreacion: fechaHoraSchema.optional(),
  idUsuario: idSchema,
  idSiniestro: idSchema,
  tipoNotificacion: tipoNotificacionSchema,
})

export const notificacionUpdateSchema = esquemaEdicion(notificacionSchema)

export type NotificacionInput = z.input<typeof notificacionSchema>
export type NotificacionData = z.output<typeof notificacionSchema>
export type NotificacionUpdateInput = z.input<typeof notificacionUpdateSchema>
export type NotificacionUpdateData = z.output<typeof notificacionUpdateSchema>
