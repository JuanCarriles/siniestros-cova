import { z } from 'zod'
import { esquemaEdicion, idSchema, textoSchema } from './comunes.ts'

// Datos de alta de Aseguradora; id y baja lógica se gestionan por separado.
// CU-02: entre 3 y 60 caracteres (mockup). Que no se repita lo controla el backend.
export const aseguradoraSchema = z.strictObject({
  nombre: textoSchema
    .min(3, 'Escribí al menos 3 caracteres')
    .max(60, 'Usá como máximo 60 caracteres'),
})

export const aseguradoraUpdateSchema = esquemaEdicion(aseguradoraSchema)

export type AseguradoraInput = z.input<typeof aseguradoraSchema>
export type AseguradoraData = z.output<typeof aseguradoraSchema>
export type AseguradoraUpdateInput = z.input<typeof aseguradoraUpdateSchema>
export type AseguradoraUpdateData = z.output<typeof aseguradoraUpdateSchema>

/** Fila del listado de aseguradoras (GET /api/aseguradoras). Cuenta solo los ajustadores activos. */
export type AseguradoraListado = {
  id: number
  nombre: string
  eliminado: boolean
  fechaBaja: string | null
  cantidadAjustadores: number
}

// Respuesta estructurada del servidor cuando la baja está bloqueada.
export const bloqueoBajaAseguradoraSchema = z.strictObject({
  codigo: z.literal('ASEGURADORA_CON_AJUSTADORES'),
  idAseguradora: idSchema,
  nombreAseguradora: textoSchema,
  cantidadAjustadores: z.number().int().positive(),
})
export type BloqueoBajaAseguradora = z.output<typeof bloqueoBajaAseguradoraSchema>

export const ajustadorVinculadoSchema = z.strictObject({
  id: idSchema,
  nombres: textoSchema,
  apellidos: textoSchema,
  email: z.email(),
  telefono: textoSchema,
})
export const ajustadoresAseguradoraSchema = z.strictObject({
  aseguradora: z.strictObject({ id: idSchema, nombre: textoSchema }),
  ajustadores: z.array(ajustadorVinculadoSchema),
})
export type AjustadorVinculado = z.output<typeof ajustadorVinculadoSchema>
export type AjustadoresAseguradora = z.output<typeof ajustadoresAseguradoraSchema>
