import { z } from 'zod'
import { esquemaEdicion, textoSchema } from './comunes.ts'

// Datos de alta de TipoDocumento; id y baja lógica se gestionan por separado.
export const tipoDocumentoSchema = z.strictObject({
  nombre: textoSchema,
})

export const tipoDocumentoUpdateSchema = esquemaEdicion(tipoDocumentoSchema)

export type TipoDocumentoInput = z.input<typeof tipoDocumentoSchema>
export type TipoDocumentoData = z.output<typeof tipoDocumentoSchema>
export type TipoDocumentoUpdateInput = z.input<typeof tipoDocumentoUpdateSchema>
export type TipoDocumentoUpdateData = z.output<typeof tipoDocumentoUpdateSchema>
