import sharp from 'sharp'
import { z } from 'zod'
import type { AlmacenamientoR2, ArchivoEntrada } from '../../lib/r2.ts'
import { HttpError } from '../../utils/httpError.ts'

export const LADO_IMAGEN = 1600
export const LADO_MINIATURA = 300
export const CALIDAD_IMAGEN = 80
const MAX_PIXELES = 40_000_000
const datosImagenSchema = z.strictObject({
  version: z.literal(1),
  anchoOriginal: z.int().positive(),
  altoOriginal: z.int().positive(),
  ancho: z.int().positive().max(LADO_IMAGEN),
  alto: z.int().positive().max(LADO_IMAGEN),
  tamanoBytes: z.int().positive(),
})
export type DatosImagen = z.infer<typeof datosImagenSchema>

export function claveDerivada(clave: string, tipo: 'vista' | 'miniatura') {
  return `${clave}.${tipo}.webp`
}
export function clavesDocumento(clave: string) {
  return /\.(jpe?g|png)$/i.test(clave)
    ? [clave, claveDerivada(clave, 'vista'), claveDerivada(clave, 'miniatura')]
    : [clave]
}
export function leerDatosImagen(metadata?: Record<string, string>): DatosImagen | null {
  if (!metadata?.['imagen-v1']) return null
  try {
    return datosImagenSchema.parse(JSON.parse(metadata['imagen-v1']))
  } catch {
    throw new HttpError(503, 'No se pudieron leer los datos de la imagen. Volvé a cargarla.')
  }
}
export function datosImagenEnBase(clave: string, imagen: DatosImagen | null) {
  return imagen
    ? {
        claveImagenOptimizada: claveDerivada(clave, 'vista'),
        claveMiniatura: claveDerivada(clave, 'miniatura'),
        anchoOriginal: imagen.anchoOriginal,
        altoOriginal: imagen.altoOriginal,
        anchoImagen: imagen.ancho,
        altoImagen: imagen.alto,
        tamanoOptimizadoBytes: BigInt(imagen.tamanoBytes),
      }
    : {}
}

/** Solo JPG/PNG: PDF y Office nunca pasan por sharp. El original siempre se conserva byte por byte. */
export async function prepararImagen(archivo: ArchivoEntrada) {
  if (!/\.(jpe?g|png)$/i.test(archivo.nombreOriginal)) return null
  try {
    const entrada = sharp(archivo.contenido, { limitInputPixels: MAX_PIXELES, failOn: 'error' })
    const metadata = await entrada.metadata()
    if (!['jpeg', 'png'].includes(metadata.format ?? '') || !metadata.width || !metadata.height)
      throw new Error('Formato de imagen inválido')
    if ((metadata.pages ?? 1) > 1) throw new Error('La imagen debe ser estática')
    // EXIF: orientar antes de reducir; no recortar, no ampliar, mantener transparencia y color sRGB.
    const base = entrada.rotate().toColourspace('srgb')
    const salida = await base
      .clone()
      .resize({ width: LADO_IMAGEN, height: LADO_IMAGEN, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: CALIDAD_IMAGEN, alphaQuality: 100 })
      .toBuffer({ resolveWithObject: true })
    const miniatura = await base
      .clone()
      .resize({
        width: LADO_MINIATURA,
        height: LADO_MINIATURA,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: CALIDAD_IMAGEN, alphaQuality: 100 })
      .toBuffer()
    const gira = (metadata.orientation ?? 1) >= 5
    const datos: DatosImagen = {
      version: 1,
      anchoOriginal: gira ? metadata.height : metadata.width,
      altoOriginal: gira ? metadata.width : metadata.height,
      ancho: salida.info.width,
      alto: salida.info.height,
      tamanoBytes: salida.data.byteLength,
    }
    return { datos, vista: salida.data, miniatura }
  } catch {
    throw new HttpError(
      400,
      'No se pudo procesar la imagen. Usá un JPG o PNG estático válido de hasta 40 millones de píxeles. El archivo original no se modifica.',
    )
  }
}

/** La metadata de R2 la escribe el servidor. El alta nunca confía en claves o medidas enviadas por el cliente. */
export async function subirDocumentoProcesado(
  r2: AlmacenamientoR2,
  archivo: ArchivoEntrada,
  carpeta: string,
) {
  const imagen = await prepararImagen(archivo)
  const objeto = await r2.subir(
    archivo,
    carpeta,
    imagen ? { 'imagen-v1': JSON.stringify(imagen.datos) } : undefined,
  )
  const claves = imagen ? clavesDocumento(objeto.clave) : [objeto.clave]
  try {
    if (imagen) {
      await r2.subirDerivada(claves[1]!, imagen.vista)
      await r2.subirDerivada(claves[2]!, imagen.miniatura)
    }
    return { objeto, imagen: imagen?.datos ?? null, claves }
  } catch (error) {
    for (const clave of claves)
      await r2
        .eliminar(clave)
        .catch(() => console.error('Objeto pendiente de limpieza en R2:', clave))
    throw error
  }
}
