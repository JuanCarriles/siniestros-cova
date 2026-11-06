import { z } from 'zod'
export {
  ARCHIVO_MAX_BYTES as PLANTILLA_MAX_BYTES,
  ARCHIVO_FORMATOS as PLANTILLA_FORMATOS,
  ARCHIVO_ACCEPT as PLANTILLA_ACCEPT,
  ARCHIVO_EXTENSIONES as PLANTILLA_EXTENSIONES,
  errorSeleccionArchivo as errorArchivoPlantilla,
} from './archivos.ts'
import {
  claveArchivoSchema,
  esquemaEdicion,
  extensionArchivoSchema,
  fechaHoraSchema,
  idSchema,
  textoSchema,
} from './comunes.ts'

// Metadatos de la entidad exportados por shared para validaciones internas.
// No es un contrato de carga HTTP: las altas usan exclusivamente altaPlantillaSchema.
export const documentoPlantillaSchema = z.strictObject({
  encabezado: z.string().trim().min(1).max(120).optional(),
  descripcion: z.string().trim().max(1000).optional(),
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

// Contrato público: el autor, la fecha y la clave de R2 nunca vienen del formulario.
export const MENSAJE_ERROR_ELIMINAR_PLANTILLA =
  'No se pudo completar la eliminación. Volvé a tocar «Eliminar definitivamente» para terminarla.'

export const altaPlantillaSchema = z.strictObject({
  encabezado: z.string().trim().min(1, 'Ingresá un encabezado').max(120, 'Máximo 120 caracteres'),
  descripcion: z
    .string()
    .trim()
    .min(1, 'Ingresá una descripción')
    .max(1000, 'Máximo 1000 caracteres'),
})

export const plantillaListadoSchema = z.strictObject({
  id: idSchema,
  encabezado: z.string(),
  descripcion: z.string(),
  nombreOriginal: z.string(),
  tipoExtension: extensionArchivoSchema,
  tamanoBytes: z.number().int().nonnegative().nullable(),
  fechaCarga: z.iso.datetime(),
  subidoPor: z.strictObject({ id: idSchema, nombres: z.string(), apellidos: z.string() }),
})

export type AltaPlantillaInput = z.input<typeof altaPlantillaSchema>
export type AltaPlantillaData = z.output<typeof altaPlantillaSchema>
export type PlantillaListado = z.output<typeof plantillaListadoSchema>
