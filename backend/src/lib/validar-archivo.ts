import { fileTypeFromBuffer } from 'file-type'
import {
  ARCHIVO_MAX_BYTES,
  ARCHIVO_EXTENSIONES,
  rechazoArchivo,
} from '@cova/shared/schemas/archivos'
import { HttpError } from '../utils/httpError.ts'

export type TipoArchivoDetectado = {
  tipoExtension: (typeof ARCHIVO_EXTENSIONES)[number]
  mimeType: string
}

/** Política común: el nombre y el MIME declarado no deciden el tipo. La detección Office
 * inspecciona el ZIP además de la firma; todos los caminos de R2 usan el mismo resultado. */
export async function validarArchivo(archivo: {
  nombreOriginal: string
  contenido: Uint8Array
}): Promise<TipoArchivoDetectado> {
  if (!archivo.contenido.byteLength)
    throw new HttpError(400, rechazoArchivo('El archivo está vacío. Elegí otro documento.'))
  if (archivo.contenido.byteLength > ARCHIVO_MAX_BYTES)
    throw new HttpError(413, rechazoArchivo('El archivo supera el máximo de 10 MB.'))
  let detectado
  try {
    detectado = await fileTypeFromBuffer(archivo.contenido)
  } catch {
    throw new HttpError(
      400,
      rechazoArchivo('No se pudo reconocer el contenido del archivo. Elegí un documento válido.'),
    )
  }
  const extension = ARCHIVO_EXTENSIONES.find((ext) => ext === detectado?.ext)
  if (!detectado || !extension)
    throw new HttpError(
      400,
      rechazoArchivo(
        'El contenido real del archivo no corresponde a un formato permitido. No alcanza con cambiarle el nombre.',
      ),
    )
  return { tipoExtension: extension, mimeType: detectado.mime }
}
