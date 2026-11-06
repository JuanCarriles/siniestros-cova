import { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { ARCHIVO_MAX_BYTES, rechazoArchivo } from '@cova/shared/schemas/archivos'
import { claveArchivoSchema } from '@cova/shared/schemas/comunes'
import { z } from 'zod'
import { leerConfiguracionR2 } from '../config/r2.ts'
import type { ConfiguracionR2 } from '../config/r2.ts'
import { HttpError } from '../utils/httpError.ts'
import { validarArchivo } from './validar-archivo.ts'

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
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const

// altas/{idUsuario}: documentos subidos durante el alta, antes de que exista el siniestro (CU-09 34)
const carpetaSchema = z
  .string()
  .regex(/^(plantillas|pruebas|siniestros\/[1-9]\d*|altas\/[1-9]\d*)$/)

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

export function mimeDeArchivo(extension: string): string {
  const clave = extension.toLowerCase()
  if (!Object.hasOwn(tiposMime, clave))
    throw new HttpError(409, 'El tipo guardado del archivo no está disponible. Solicitá revisarlo.')
  return tiposMime[clave as keyof typeof tiposMime]
}

export function nombreDescargaArchivo(nombreOriginal: string, extension: string): string {
  const nombre = nombreArchivoSchema.parse(nombreOriginal)
  const actual = nombre.split('.').pop()?.toLowerCase()
  if (actual === extension || (extension === 'jpg' && actual === 'jpeg')) return nombre
  const base = nombre.replace(/\.[^.]+$/, '').slice(0, 254 - extension.length)
  return `${base}.${extension}`
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
    async subir(entrada: ArchivoEntrada, carpeta: string, metadata?: Record<string, string>) {
      const archivo = archivoSchema.parse(entrada)
      const prefijo = carpetaSchema.parse(carpeta)
      const { tipoExtension, mimeType } = await validarArchivo(archivo)
      if (archivo.contenido.byteLength > config.UPLOAD_MAX_MB * 1024 * 1024)
        throw new HttpError(
          413,
          rechazoArchivo(`El archivo supera el máximo de ${config.UPLOAD_MAX_MB} MB.`),
        )
      if (
        !config.UPLOAD_ALLOWED_EXT.some((ext) => (ext === 'jpeg' ? 'jpg' : ext) === tipoExtension)
      )
        throw new HttpError(
          400,
          rechazoArchivo('El contenido real no está habilitado en este servidor.'),
        )
      const contenido = archivo.contenido
      const clave = claveArchivoSchema.parse(`${prefijo}/${randomUUID()}.${tipoExtension}`)
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: config.R2_BUCKET,
            Key: clave,
            Body: contenido,
            Metadata: metadata,
            ContentType: mimeType,
            ContentLength: contenido.byteLength,
            ContentDisposition: disposicionDescarga(
              nombreDescargaArchivo(archivo.nombreOriginal, tipoExtension),
            ),
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

    // Solo derivados creados por sharp; WebP no se habilita como formato de entrada del usuario.
    async subirDerivada(clave: string, contenido: Uint8Array, metadata?: Record<string, string>) {
      const key = claveArchivoSchema.parse(clave)
      if (
        !/^(siniestros|altas)\/[1-9]\d*\/[a-f0-9-]+\.(?:(jpe?g|png)\.(vista|miniatura)\.webp|webp(?:\.miniatura\.webp)?)$/i.test(
          key,
        ) ||
        !contenido.byteLength ||
        contenido.byteLength > 10 * 1024 * 1024
      )
        throw new HttpError(400, 'Imagen derivada inválida')
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: config.R2_BUCKET,
            Key: key,
            Body: contenido,
            ContentType: 'image/webp',
            ContentDisposition: disposicionDescarga(key.split('/').pop()!),
            Metadata: metadata,
            ContentLength: contenido.byteLength,
            CacheControl: 'private, no-store',
          }),
        )
      } catch (error) {
        throw errorR2('No se pudo guardar la vista de la imagen en R2', error)
      }
    },

    // Una firma se genera localmente: no demuestra que el objeto exista en R2.
    // Comprobar solo después de autorizar y resolver la clave desde la base.
    async comprobarExistencia(clave: string) {
      const key = claveArchivoSchema.parse(clave)
      try {
        const objeto = await s3.send(new HeadObjectCommand({ Bucket: config.R2_BUCKET, Key: key }))
        return objeto.Metadata
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

    /** Lectura privada para PDF.js: GET único y consumo progresivo con límite de bytes. */
    async leerParaVista(clave: string) {
      const key = claveArchivoSchema.parse(clave)
      const abortar = new AbortController()
      try {
        const objeto = await s3.send(new GetObjectCommand({ Bucket: config.R2_BUCKET, Key: key }), {
          abortSignal: AbortSignal.any([abortar.signal, AbortSignal.timeout(30000)]),
        })
        const cuerpo = objeto.Body
        if (!cuerpo) throw new Error('Sin contenido')
        const cerrar = () => {
          abortar.abort()
          if ('destroy' in cuerpo && typeof cuerpo.destroy === 'function') cuerpo.destroy()
        }
        if (objeto.ContentLength !== undefined && objeto.ContentLength > ARCHIVO_MAX_BYTES) {
          cerrar()
          throw new Error('Archivo demasiado grande')
        }
        const stream = Readable.from(
          (async function* () {
            let longitud = 0
            try {
              for await (const trozo of cuerpo as AsyncIterable<Uint8Array>) {
                longitud += trozo.byteLength
                if (longitud > ARCHIVO_MAX_BYTES) throw new Error('Archivo demasiado grande')
                yield trozo
              }
            } catch (error) {
              throw errorR2(
                'No se pudo completar la lectura del documento. Volvé a intentarlo.',
                error,
              )
            } finally {
              cerrar()
            }
          })(),
          { objectMode: false },
        )
        stream.once('close', cerrar)
        return stream
      } catch (error) {
        abortar.abort()
        const fallo = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null
        if (
          fallo?.name === 'NoSuchKey' ||
          fallo?.name === 'NotFound' ||
          fallo?.$metadata?.httpStatusCode === 404
        )
          throw new HttpError(
            404,
            'El archivo no está disponible en el almacenamiento. Pedile a un administrador que lo revise.',
          )
        throw errorR2('No se pudo abrir el documento. Volvé a intentarlo.', error)
      }
    },

    // Sólo llamar después de autorizar al usuario y obtener la clave de la base.
    async firmarDescarga(clave: string, nombreOriginal: string, mimeType: string) {
      const key = claveArchivoSchema.parse(clave)
      const formato = Object.entries(tiposMime).find(([, mime]) => mime === mimeType)?.[0]
      if (!formato)
        throw new HttpError(
          409,
          'El tipo guardado del archivo no está disponible. Solicitá revisarlo.',
        )
      const disposition = disposicionDescarga(nombreDescargaArchivo(nombreOriginal, formato))
      const emitida = new Date()
      try {
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: config.R2_BUCKET,
            Key: key,
            ResponseContentDisposition: disposition,
            ResponseContentType: mimeType,
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

    // Copia un objeto a otra carpeta con el mismo nombre (UUID.ext); el original queda. Sirve para mover: copiar,
    // registrar la clave nueva y recién entonces borrar el original. Devuelve la clave nueva.
    async copiar(clave: string, carpeta: string) {
      const origen = claveArchivoSchema.parse(clave)
      const destino = claveArchivoSchema.parse(
        `${carpetaSchema.parse(carpeta)}/${origen.split('/').pop()}`,
      )
      try {
        await s3.send(
          new CopyObjectCommand({
            Bucket: config.R2_BUCKET,
            Key: destino,
            CopySource: `${config.R2_BUCKET}/${origen.split('/').map(encodeURIComponent).join('/')}`,
          }),
        )
      } catch (error) {
        throw errorR2('No se pudo copiar el objeto en R2', error)
      }
      return destino
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
