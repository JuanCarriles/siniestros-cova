import { fileTypeFromBuffer } from 'file-type'
import {
  ARCHIVO_MAX_BYTES,
  ARCHIVO_EXTENSIONES,
  rechazoArchivo,
} from '@cova/shared/schemas/archivos'
import type { ArchivoEntrada } from '../../lib/r2.ts'
import { HttpError } from '../../utils/httpError.ts'

/** CU-10 / E6-03: tamaño real del buffer, firma binaria y estructura del contenedor Office.
 * Nunca confía en Content-Type, tamaño declarado ni extensión para decidir el tipo real.
 * La extensión se comprueba después de detectar el contenido, como control adicional de coherencia.
 */
export async function validarArchivoPlantilla(archivo: ArchivoEntrada) {
  if (!archivo.contenido.byteLength)
    throw new HttpError(400, rechazoArchivo('El archivo está vacío. Elegí otro documento.'))
  if (archivo.contenido.byteLength > ARCHIVO_MAX_BYTES)
    throw new HttpError(413, rechazoArchivo('El archivo supera el máximo de 10 MB.'))
  let detectado
  try {
    // file-type inspecciona las firmas iniciales. Para DOCX/XLSX inspecciona además el ZIP, sin confiar en el nombre.
    detectado = await fileTypeFromBuffer(archivo.contenido)
  } catch {
    throw new HttpError(
      400,
      rechazoArchivo('No se pudo reconocer el contenido del archivo. Elegí un documento válido.'),
    )
  }
  if (!detectado || !ARCHIVO_EXTENSIONES.some((ext) => ext === detectado.ext))
    throw new HttpError(
      400,
      rechazoArchivo(
        'El contenido real del archivo no corresponde a un formato permitido. No alcanza con cambiarle el nombre.',
      ),
    )
  const extension = archivo.nombreOriginal.split('.').pop()?.toLowerCase()
  const esperada = extension === 'jpeg' ? 'jpg' : extension
  if (detectado.ext !== esperada)
    throw new HttpError(
      400,
      rechazoArchivo(
        'El contenido real del archivo no coincide con su extensión. Elegí el archivo con su nombre original.',
      ),
    )
}
