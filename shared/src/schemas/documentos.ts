import { z } from 'zod'
import { claveArchivoSchema, esquemaEdicion, extensionArchivoSchema, fechaHoraSchema, idSchema, mimeTypeSchema, tamanoBytesSchema, textoSchema } from './comunes.ts'

// Datos de alta de DocumentoSiniestro; id y baja lógica se gestionan por separado.
export const documentoSiniestroSchema = z.strictObject({
  nombreOriginal: textoSchema,
  urlArchivoSinDominio: claveArchivoSchema,
  tipoExtension: extensionArchivoSchema,
  mimeType: mimeTypeSchema,
  tamanoBytes: tamanoBytesSchema,
  fechaCarga: fechaHoraSchema.optional(),
  idUsuario: idSchema,
  idSiniestro: idSchema,
})

export const documentoSiniestroUpdateSchema = esquemaEdicion(documentoSiniestroSchema)

export type DocumentoSiniestroInput = z.input<typeof documentoSiniestroSchema>
export type DocumentoSiniestroData = z.output<typeof documentoSiniestroSchema>
export type DocumentoSiniestroUpdateInput = z.input<typeof documentoSiniestroUpdateSchema>
export type DocumentoSiniestroUpdateData = z.output<typeof documentoSiniestroUpdateSchema>
