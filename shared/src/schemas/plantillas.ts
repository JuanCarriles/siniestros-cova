import { z } from 'zod'
import { claveArchivoSchema, esquemaEdicion, extensionArchivoSchema, fechaHoraSchema, idSchema, textoSchema } from './comunes.ts'

// Datos de alta de DocumentoPlantilla; id y baja lógica se gestionan por separado.
export const documentoPlantillaSchema = z.strictObject({
  nombreOriginal: textoSchema,
  urlArchivo: claveArchivoSchema,
  tipoExtension: extensionArchivoSchema,
  fechaCarga: fechaHoraSchema.optional(),
  idUsuario: idSchema,
})

export const documentoPlantillaUpdateSchema = esquemaEdicion(documentoPlantillaSchema)

export type DocumentoPlantillaInput = z.input<typeof documentoPlantillaSchema>
export type DocumentoPlantillaData = z.output<typeof documentoPlantillaSchema>
export type DocumentoPlantillaUpdateInput = z.input<typeof documentoPlantillaUpdateSchema>
export type DocumentoPlantillaUpdateData = z.output<typeof documentoPlantillaUpdateSchema>
