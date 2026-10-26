import { randomUUID } from 'node:crypto'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { claveArchivoSchema } from '@cova/shared/schemas/comunes'
import { z } from 'zod'
import { leerConfiguracionR2 } from '../config/r2.ts'
import type { ConfiguracionR2 } from '../config/r2.ts'
import { HttpError } from '../utils/httpError.ts'

const nombreArchivoSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  // eslint-disable-next-line no-control-regex -- Rechazar controles evita inyección de cabeceras.
  .refine((value) => !/[\x00-\x1f\x7f/\\\ud800-\udfff]/u.test(value), 'Nombre de archivo inválido')

const archivoSchema = z.strictObject({
  nombreOriginal: nombreArchivoSchema,
  contenido: z.custom<Uint8Array>(
    (value) => value instanceof Uint8Array,
    'Contenido de archivo inválido',
  ),
})

export type ArchivoEntrada = z.input<typeof archivoSchema>

const tiposMime = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const

const carpetaSchema = z.string().regex(/^(plantillas|pruebas|siniestros\/[1-9]\d*)$/)

function errorR2(mensaje: string, error: unknown): HttpError {
  const fallo = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } } | null
  const conocidos = [
    'AccessDenied',
    'SignatureDoesNotMatch',
    'InvalidAccessKeyId',
    'NoSuchBucket',
    'NoSuchKey',
    'RequestTimeTooSkewed',
    'TimeoutError',
    'InvalidArgument',
  ]
  const codigo =
    typeof fallo?.name === 'string' && conocidos.includes(fallo.name) ? fallo.name : 'R2_ERROR'
  const estadoHTTP =
    typeof fallo?.$metadata?.httpStatusCode === 'number'
      ? fallo.$metadata.httpStatusCode
      : undefined
  // No propagar mensajes, causas, requests ni responses completos del SDK.
  return new HttpError(503, mensaje, { codigo, estadoHTTP })
}

function disposicionDescarga(nombreOriginal: string): string {
  const nombre = nombreArchivoSchema.parse(nombreOriginal)
  const codificado = encodeURIComponent(nombre).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="archivo"; filename*=UTF-8''${codificado}`
}

export function crearAlmacenamientoR2(
  config: ConfiguracionR2 = leerConfiguracionR2(),
  cliente?: S3Client,
) {
  const s3 =
    cliente ??
    new S3Client({
      region: 'auto',
      endpoint: config.R2_ENDPOINT || `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.R2_ACCESS_KEY_ID,
        secretAccessKey: config.R2_SECRET_ACCESS_KEY,
      },
      maxAttempts: 3,
      requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000 },
      // R2 soporta MD5/SHA256; no depender de nuevos algoritmos opcionales del SDK.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })

  return {
    async subir(entrada: ArchivoEntrada, carpeta: string) {
      const archivo = archivoSchema.parse(entrada)
      const prefijo = carpetaSchema.parse(carpeta)
      if (
        archivo.contenido.byteLength === 0 ||
        archivo.contenido.byteLength > config.UPLOAD_MAX_MB * 1024 * 1024
      ) {
        throw new HttpError(
          400,
          `El archivo debe tener contenido y pesar como máximo ${config.UPLOAD_MAX_MB} MB`,
        )
      }
      const extension = archivo.nombreOriginal.split('.').pop()?.toLowerCase()
      if (!extension || !config.UPLOAD_ALLOWED_EXT.includes(extension as keyof typeof tiposMime)) {
        throw new HttpError(400, 'Extensión de archivo no permitida')
      }
      const tipoExtension = extension as keyof typeof tiposMime
      const mimeType = tiposMime[tipoExtension]
      const contenido = archivo.contenido
      const clave = claveArchivoSchema.parse(`${prefijo}/${randomUUID()}.${tipoExtension}`)
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: config.R2_BUCKET,
            Key: clave,
            Body: contenido,
            ContentType: mimeType,
            ContentLength: contenido.byteLength,
            ContentDisposition: disposicionDescarga(archivo.nombreOriginal),
            CacheControl: 'private, no-store',
          }),
        )
      } catch (error) {
        throw errorR2('No se pudo subir el archivo a R2', error)
      }
      return {
        clave,
        nombreOriginal: archivo.nombreOriginal,
        tipoExtension,
        mimeType,
        tamanoBytes: BigInt(contenido.byteLength),
      }
    },

    // Una firma se genera localmente: no demuestra que el objeto exista en R2.
    // Comprobar solo después de autorizar y resolver la clave desde la base.
    async comprobarExistencia(clave: string) {
      const key = claveArchivoSchema.parse(clave)
      try {
        await s3.send(new HeadObjectCommand({ Bucket: config.R2_BUCKET, Key: key }))
      } catch (error) {
        const nombre = (error as { name?: unknown } | null)?.name
        if (nombre === 'NotFound' || nombre === 'NoSuchKey') {
          // HEAD puede devolver un 404 genérico también si falta el bucket.
          // Solo confirmar ausencia del archivo si el bucket sigue accesible.
          try {
            await s3.send(new HeadBucketCommand({ Bucket: config.R2_BUCKET }))
          } catch (errorBucket) {
            throw errorR2('No se pudo comprobar la disponibilidad del bucket de R2', errorBucket)
          }
          throw new HttpError(
            404,
            'El archivo de esta plantilla no está disponible en el almacenamiento. Pedile a un administrador que vuelva a cargarlo.',
          )
        }
        throw errorR2('No se pudo comprobar la disponibilidad del archivo en R2', error)
      }
    },

    // Sólo llamar después de autorizar al usuario y obtener la clave de la base.
    async firmarDescarga(clave: string, nombreOriginal: string) {
      const key = claveArchivoSchema.parse(clave)
      const disposition = disposicionDescarga(nombreOriginal)
      const emitida = new Date()
      try {
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: config.R2_BUCKET,
            Key: key,
            ResponseContentDisposition: disposition,
            ResponseCacheControl: 'private, no-store',
          }),
          { expiresIn: config.R2_SIGNED_URL_TTL_SECONDS, signingDate: emitida },
        )
        return {
          url,
          venceEnSegundos: config.R2_SIGNED_URL_TTL_SECONDS,
          venceEn: new Date(
            emitida.getTime() + config.R2_SIGNED_URL_TTL_SECONDS * 1000,
          ).toISOString(),
        }
      } catch (error) {
        throw errorR2('No se pudo generar la descarga de R2', error)
      }
    },

    // Borrado físico de plantillas autorizadas, compensación de altas y pruebas; no usar para bajas lógicas.
    async eliminar(clave: string) {
      const key = claveArchivoSchema.parse(clave)
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: config.R2_BUCKET, Key: key }))
      } catch (error) {
        throw errorR2('No se pudo eliminar el objeto de R2', error)
      }
    },

    cerrar() {
      s3.destroy()
    },
  }
}

export type AlmacenamientoR2 = ReturnType<typeof crearAlmacenamientoR2>
