import { z } from 'zod'
import { esquemaEdicion, textoSchema } from './comunes.ts'

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
