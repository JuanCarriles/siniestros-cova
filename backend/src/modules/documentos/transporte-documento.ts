import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import { rechazoArchivo } from '@cova/shared/schemas/archivos'
import { DOCUMENTO_MAX_BYTES, compresionDocumentoSchema } from '@cova/shared/schemas/documentos'
import type { ArchivoEntrada } from '../../lib/r2.ts'
import { HttpError } from '../../utils/httpError.ts'

const descomprimir = promisify(gunzip)
// El límite se aplica también al contenido descomprimido, sin confiar en un tamaño declarado por el navegador.
export async function decodificarDocumento(
  archivo: ArchivoEntrada,
  codificacion: unknown,
): Promise<ArchivoEntrada> {
  const compresion = compresionDocumentoSchema.parse(codificacion)
  if (archivo.contenido.byteLength > DOCUMENTO_MAX_BYTES)
    throw new HttpError(413, rechazoArchivo('El archivo supera el máximo de 10 MB.'))
  if (compresion === 'identity') return archivo
  try {
    const contenido = await descomprimir(archivo.contenido, {
      maxOutputLength: DOCUMENTO_MAX_BYTES,
    })
    return { nombreOriginal: archivo.nombreOriginal, contenido }
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ERR_BUFFER_TOO_LARGE'
    )
      throw new HttpError(413, rechazoArchivo('El archivo original supera el máximo de 10 MB.'))
    throw new HttpError(
      400,
      rechazoArchivo(
        'No se pudo descomprimir el archivo. Volvé a seleccionarlo e intentá de nuevo.',
      ),
    )
  }
}
