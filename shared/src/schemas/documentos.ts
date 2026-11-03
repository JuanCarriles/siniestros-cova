import { z } from 'zod'
import {
  PLANTILLA_MAX_BYTES,
  PLANTILLA_ACCEPT,
  PLANTILLA_FORMATOS,
  errorArchivoPlantilla,
} from './plantillas.ts'

export const DOCUMENTO_MAX_BYTES = PLANTILLA_MAX_BYTES
export const DOCUMENTO_ACCEPT = PLANTILLA_ACCEPT
export const DOCUMENTO_FORMATOS = PLANTILLA_FORMATOS
export const errorArchivoDocumento = errorArchivoPlantilla
export const idCargaDocumentoSchema = z.uuid()
export const compresionDocumentoSchema = z.enum(['identity', 'gzip']).default('identity')
export const documentoSubidoSchema = z.strictObject({ id: z.int().positive() })
export type DocumentoSubido = z.output<typeof documentoSubidoSchema>

import {
  claveArchivoSchema,
  esquemaEdicion,
  extensionArchivoSchema,
  fechaHoraSchema,
  idSchema,
  mimeTypeSchema,
  tamanoBytesSchema,
  textoSchema,
} from './comunes.ts'

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
