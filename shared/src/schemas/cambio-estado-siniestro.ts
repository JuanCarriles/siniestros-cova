import { z } from 'zod'
import { cierreInformeSchema } from './informes.ts'

export const estadoDisponibleSchema = z.strictObject({
  id: z.int().positive(),
  nombre: z.string(),
  descripcion: z.string(),
  esCierre: z.boolean(),
})
export const opcionesCambioEstadoSchema = z.strictObject({
  estadoActual: estadoDisponibleSchema,
  estados: z.array(estadoDisponibleSchema),
})
export const cambiarEstadoSiniestroSchema = z.strictObject({
  idEstadoSiniestro: z.int().positive(),
  // Evita confirmar sobre un estado que otro usuario ya cambió.
  idEstadoAnterior: z.int().positive(),
  cierre: cierreInformeSchema.optional(),
})
export type EstadoDisponible = z.output<typeof estadoDisponibleSchema>
export type OpcionesCambioEstado = z.output<typeof opcionesCambioEstadoSchema>
export type CambiarEstadoSiniestro = z.output<typeof cambiarEstadoSiniestroSchema>
