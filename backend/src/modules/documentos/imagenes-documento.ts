import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { z } from 'zod'
import { rechazoArchivo } from '@cova/shared/schemas/archivos'
import { validarArchivo } from '../../lib/validar-archivo.ts'
import { nombreDescargaArchivo, type AlmacenamientoR2, type ArchivoEntrada } from '../../lib/r2.ts'
import { HttpError } from '../../utils/httpError.ts'

export const LADO_IMAGEN = 1600
export const LADO_MINIATURA = 300
export const CALIDAD_IMAGEN = 80
const MAX_PIXELES = 40_000_000
const medidas = {
  anchoOriginal: z.int().positive(),
  altoOriginal: z.int().positive(),
  ancho: z.int().positive(),
  alto: z.int().positive(),
  tamanoBytes: z.int().positive(),
}
// v1 conserva original + vista + miniatura. No se reescriben archivos ni metadatos existentes.
const datosImagenSchema = z.discriminatedUnion('version', [
  z.strictObject({ version: z.literal(1), ...medidas }),
  z.strictObject({
    version: z.literal(2),
    ...medidas,
    tipoExtension: z.enum(['jpg', 'jpeg', 'png', 'webp']),
  }),
])
export type DatosImagen = z.infer<typeof datosImagenSchema>

export function claveDerivada(clave: string, tipo: 'vista' | 'miniatura') {
  return `${clave}.${tipo}.webp`
}
export function clavesDocumento(clave: string, imagen?: DatosImagen | null) {
  if (imagen?.version === 2 || /\.webp$/i.test(clave))
    return [clave, claveDerivada(clave, 'miniatura')]
  // La limpieza también reconoce las tres claves de imágenes anteriores. Borrar una clave
  // inexistente es idempotente; nunca se pide una vista inexistente durante la copia del alta.
  return /\.(jpe?g|png)$/i.test(clave)
    ? [clave, claveDerivada(clave, 'vista'), claveDerivada(clave, 'miniatura')]
    : [clave]
}
export function leerDatosImagen(metadata?: Record<string, string>): DatosImagen | null {
  const datos = metadata?.['imagen-v2'] ?? metadata?.['imagen-v1']
  if (!datos) return null
  try {
    return datosImagenSchema.parse(JSON.parse(datos))
  } catch {
    throw new HttpError(503, 'No se pudieron leer los datos de la imagen. Volvé a cargarla.')
  }
}
export function datosImagenEnBase(clave: string, imagen: DatosImagen | null) {
  return imagen
    ? {
        // Columna de compatibilidad: solo los registros v1 tienen una copia adicional de vista.
        claveImagenOptimizada: imagen.version === 1 ? claveDerivada(clave, 'vista') : null,
        claveMiniatura: claveDerivada(clave, 'miniatura'),
        anchoOriginal: imagen.anchoOriginal,
        altoOriginal: imagen.altoOriginal,
        anchoImagen: imagen.ancho,
        altoImagen: imagen.alto,
        tamanoOptimizadoBytes: BigInt(imagen.tamanoBytes),
      }
    : {}
}

/** Política acordada: archivo del expediente de hasta 1600 px/80 + miniatura. Solo guardar
 * la versión reducida si hay reducción de dimensiones Y de bytes. PDF/Office no se procesan. */
export async function prepararImagen(archivo: ArchivoEntrada) {
  if (!/\.(jpe?g|png)$/i.test(archivo.nombreOriginal)) return null
  try {
    const entrada = sharp(archivo.contenido, { limitInputPixels: MAX_PIXELES, failOn: 'error' })
    const metadata = await entrada.metadata()
    if (
      !['jpeg', 'png'].includes(metadata.format ?? '') ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) > 1
    )
      throw new Error('Formato de imagen inválido')
    const gira = (metadata.orientation ?? 1) >= 5
    const anchoOriginal = gira ? metadata.height : metadata.width
    const altoOriginal = gira ? metadata.width : metadata.height
    const base = entrada.rotate().toColourspace('srgb')
    let contenido: Uint8Array = archivo.contenido
    let ancho = anchoOriginal,
      alto = altoOriginal
    let tipoExtension = archivo.nombreOriginal.split('.').pop()!.toLowerCase() as
      'jpg' | 'jpeg' | 'png' | 'webp'
    if (Math.max(anchoOriginal, altoOriginal) > LADO_IMAGEN) {
      const salida = await base
        .clone()
        .resize({
          width: LADO_IMAGEN,
          height: LADO_IMAGEN,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: CALIDAD_IMAGEN, alphaQuality: 100 })
        .toBuffer({ resolveWithObject: true })
      if (salida.data.byteLength < archivo.contenido.byteLength) {
        contenido = salida.data
        ancho = salida.info.width
        alto = salida.info.height
        tipoExtension = 'webp'
      }
    }
    const mini = base.clone().resize({
      width: LADO_MINIATURA,
      height: LADO_MINIATURA,
      fit: 'inside',
      withoutEnlargement: true,
    })
    let miniatura = await mini
      .clone()
      .webp({ quality: CALIDAD_IMAGEN, alphaQuality: 100 })
      .toBuffer()
    if (miniatura.byteLength >= archivo.contenido.byteLength) {
      // En dibujos/PNG de paleta, WebP sin pérdida puede pesar mucho menos que el de calidad 80.
      const sinPerdida = await mini
        .clone()
        .webp({ lossless: true, quality: CALIDAD_IMAGEN })
        .toBuffer()
      if (sinPerdida.byteLength < miniatura.byteLength) miniatura = sinPerdida
    }
    const datos: DatosImagen = {
      version: 2,
      anchoOriginal,
      altoOriginal,
      ancho,
      alto,
      tamanoBytes: contenido.byteLength,
      tipoExtension,
    }
    return { datos, contenido, miniatura }
  } catch {
    throw new HttpError(
      400,
      rechazoArchivo(
        'No se pudo procesar la imagen. Usá un JPG o PNG estático válido de hasta 40 millones de píxeles.',
      ),
    )
  }
}

/** Nunca sube un original adicional cuando se guarda la versión comprimida. */
export async function subirDocumentoProcesado(
  r2: AlmacenamientoR2,
  archivo: ArchivoEntrada,
  carpeta: string,
) {
  const detectado = await validarArchivo(archivo)
  const imagen = await prepararImagen({
    ...archivo,
    nombreOriginal: nombreDescargaArchivo(archivo.nombreOriginal, detectado.tipoExtension),
  })
  const metadata = imagen ? { 'imagen-v2': JSON.stringify(imagen.datos) } : undefined
  const comprimida = imagen?.datos.tipoExtension === 'webp'
  // Validar también el nombre antes de subir por el camino interno de WebP.
  if (comprimida) nombreDescargaArchivo(archivo.nombreOriginal, 'webp')
  const objeto = comprimida
    ? {
        clave: `${carpeta}/${randomUUID()}.webp`,
        nombreOriginal: archivo.nombreOriginal,
        tipoExtension: 'webp' as const,
        mimeType: 'image/webp',
        tamanoBytes: BigInt(imagen.contenido.byteLength),
      }
    : await r2.subir(archivo, carpeta, metadata)
  const claves = imagen ? clavesDocumento(objeto.clave, imagen.datos) : [objeto.clave]
  try {
    if (comprimida) await r2.subirDerivada(objeto.clave, imagen.contenido, metadata)
    if (imagen) await r2.subirDerivada(claveDerivada(objeto.clave, 'miniatura'), imagen.miniatura)
    return { objeto, imagen: imagen?.datos ?? null, claves }
  } catch (error) {
    for (const clave of claves)
      await r2
        .eliminar(clave)
        .catch(() => console.error('Objeto pendiente de limpieza en R2:', clave))
    throw error
  }
}
