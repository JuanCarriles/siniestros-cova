import { z } from 'zod'
import { emailSchema, esquemaEdicion, idSchema, telefonoSchema, textoSchema } from './comunes.ts'

const maximo = (largo: number) => `Usá como máximo ${largo} caracteres`

// El selector del formulario arranca vacío (''): ese caso tiene que decir qué falta, no "Invalid input"
const aseguradoraElegidaSchema = z
  .union([z.number(), z.string()], { error: 'Elegí una aseguradora' })
  .refine((valor) => valor !== '', 'Elegí una aseguradora')
  .pipe(idSchema)

// Datos de alta de Ajustador (CU-03); id y baja lógica se gestionan por separado. Que el email no se repita y
// que la aseguradora esté activa lo controla el backend.
export const ajustadorSchema = z.strictObject({
  nombres: textoSchema.max(60, maximo(60)),
  apellidos: textoSchema.max(60, maximo(60)),
  email: emailSchema.pipe(z.string().max(120, maximo(120))),
  telefono: telefonoSchema.max(30, maximo(30)),
  idAseguradora: aseguradoraElegidaSchema,
})

export const ajustadorUpdateSchema = esquemaEdicion(ajustadorSchema)

export type AjustadorInput = z.input<typeof ajustadorSchema>
export type AjustadorData = z.output<typeof ajustadorSchema>
export type AjustadorUpdateInput = z.input<typeof ajustadorUpdateSchema>
export type AjustadorUpdateData = z.output<typeof ajustadorUpdateSchema>

/** Fila del listado de ajustadores (GET /api/ajustadores). Casos activos: siniestros sin eliminar ni cerrar. */
export type AjustadorListado = {
  id: number
  nombres: string
  apellidos: string
  email: string
  telefono: string
  eliminado: boolean
  fechaBaja: string | null
  aseguradora: { id: number; nombre: string; eliminado: boolean }
  casosActivos: number
}

// Respuesta estructurada del servidor cuando la baja está bloqueada (CU-03 3.a).
export const bloqueoBajaAjustadorSchema = z.strictObject({
  codigo: z.literal('AJUSTADOR_CON_SINIESTROS'),
  idAjustador: idSchema,
  nombreAjustador: textoSchema,
  casosActivos: z.number().int().positive(),
})
export type BloqueoBajaAjustador = z.output<typeof bloqueoBajaAjustadorSchema>

/** Campo del formulario al que corresponde un 409 de alta o modificación (email repetido, aseguradora no válida). */
export const campoConflictoAjustadorSchema = z.strictObject({
  campo: z.enum(['email', 'idAseguradora']),
})
