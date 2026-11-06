import { z } from 'zod'
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

export const bajaDocumentoSchema = z.strictObject({
  motivo: z
    .string()
    .trim()
    .min(1, 'Ingresá el motivo de la baja.')
    .max(1000, 'El motivo admite hasta 1000 caracteres.'),
})
export type BajaDocumento = z.output<typeof bajaDocumentoSchema>
export type PermisoBajaDocumento = { permitida: boolean; motivo: string | null }

/** La interfaz informa; el servidor vuelve a evaluar la regla al confirmar, con su propio reloj. */
export function permisoBajaDocumento(
  actor: { id: number; tipoUsuario: string },
  documento: { idUsuario: number; fechaCarga: Date; eliminado: boolean },
  caso: { eliminado: boolean; cerrado: boolean },
  ahora: Date,
): PermisoBajaDocumento {
  if (documento.eliminado)
    return { permitida: false, motivo: 'Este documento ya está dado de baja.' }
  if (caso.eliminado || caso.cerrado)
    return {
      permitida: false,
      motivo: 'El siniestro está cerrado o dado de baja: sus documentos son de solo lectura.',
    }
  if (actor.tipoUsuario === 'ADMINISTRADOR' || actor.tipoUsuario === 'SUPER_ADMINISTRADOR')
    return { permitida: true, motivo: null }
  const edad = ahora.getTime() - documento.fechaCarga.getTime()
  if (
    actor.tipoUsuario !== 'GESTOR' ||
    actor.id !== documento.idUsuario ||
    edad < 0 ||
    edad > 48 * 60 * 60 * 1000
  )
    return {
      permitida: false,
      motivo:
        'Solo podés dar de baja documentos que cargaste vos durante las primeras 48 horas. Solicitá la baja a un administrador.',
    }
  return { permitida: true, motivo: null }
}

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
