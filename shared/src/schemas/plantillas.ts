import { z } from 'zod'
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
export const PLANTILLA_MAX_BYTES = 10 * 1024 * 1024
export const PLANTILLA_FORMATOS = 'PDF, JPG, PNG, DOCX y XLSX'
export const MENSAJE_ERROR_ELIMINAR_PLANTILLA =
  'No se pudo completar la eliminación. Volvé a tocar «Eliminar definitivamente» para terminarla.'
export const PLANTILLA_ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx'
export const PLANTILLA_EXTENSIONES = ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx'] as const

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

// Validación inmediata de selección. El servidor comprueba además el contenido binario real.
export function errorArchivoPlantilla(archivo: { name: string; size: number }): string | null {
  if (archivo.size === 0) return 'El archivo está vacío. Elegí otro documento.'
  if (archivo.size > PLANTILLA_MAX_BYTES) return 'El archivo supera el máximo de 10 MB.'
  const extension = archivo.name.split('.').pop()?.toLowerCase()
  if (!PLANTILLA_EXTENSIONES.some((permitida) => permitida === extension)) {
    return `Elegí un archivo ${PLANTILLA_FORMATOS}.`
  }
  return null
}
