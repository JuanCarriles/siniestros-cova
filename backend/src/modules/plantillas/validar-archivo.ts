import { fileTypeFromBuffer } from 'file-type'
import { errorArchivoPlantilla } from '@cova/shared/schemas/plantillas'
import type { ArchivoEntrada } from '../../lib/r2.ts'
import { HttpError } from '../../utils/httpError.ts'

export async function validarArchivoPlantilla(archivo: ArchivoEntrada) {
  const error = errorArchivoPlantilla({
    name: archivo.nombreOriginal,
    size: archivo.contenido.byteLength,
  })
  if (error) throw new HttpError(400, error)
  let detectado
  try {
    detectado = await fileTypeFromBuffer(archivo.contenido)
  } catch {
    throw new HttpError(
      400,
      'No se pudo reconocer el contenido del archivo. Elegí un documento válido.',
    )
  }
  const extension = archivo.nombreOriginal.split('.').pop()?.toLowerCase()
  const esperada = extension === 'jpeg' ? 'jpg' : extension
  if (!detectado || detectado.ext !== esperada) {
    throw new HttpError(
      400,
      'El contenido real del archivo no coincide con su extensión o no es un formato permitido. No alcanza con cambiarle el nombre.',
    )
  }
}
