import { z } from 'zod'
import { esquemaEdicion, fechaHoraSchema, idSchema, textoSchema } from './comunes.ts'

// Datos de alta de MensajeChat; id y baja lógica se gestionan por separado.
export const mensajeChatSchema = z.strictObject({
  fechaEnvio: fechaHoraSchema.optional(),
  contenidoMensaje: textoSchema,
  idUsuario: idSchema,
  idSiniestro: idSchema,
})

export const mensajeChatUpdateSchema = esquemaEdicion(mensajeChatSchema)

export type MensajeChatInput = z.input<typeof mensajeChatSchema>
export type MensajeChatData = z.output<typeof mensajeChatSchema>
export type MensajeChatUpdateInput = z.input<typeof mensajeChatUpdateSchema>
export type MensajeChatUpdateData = z.output<typeof mensajeChatUpdateSchema>

// Datos de alta de LecturaMensajeChat; id y baja lógica se gestionan por separado.
export const lecturaMensajeChatSchema = z.strictObject({
  idMensajeChat: idSchema,
  idUsuario: idSchema,
  fechaLeido: fechaHoraSchema,
})

export const lecturaMensajeChatUpdateSchema = esquemaEdicion(lecturaMensajeChatSchema)

export type LecturaMensajeChatInput = z.input<typeof lecturaMensajeChatSchema>
export type LecturaMensajeChatData = z.output<typeof lecturaMensajeChatSchema>
export type LecturaMensajeChatUpdateInput = z.input<typeof lecturaMensajeChatUpdateSchema>
export type LecturaMensajeChatUpdateData = z.output<typeof lecturaMensajeChatUpdateSchema>
