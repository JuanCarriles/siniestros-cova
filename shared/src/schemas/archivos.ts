// Política común de adjuntos (CU-10, E6-03). El servidor verifica los bytes; la selección del navegador es solo ayuda.
export const ARCHIVO_MAX_MB = 10
export const ARCHIVO_MAX_BYTES = ARCHIVO_MAX_MB * 1024 * 1024
export const ARCHIVO_FORMATOS = 'PDF, JPG, PNG, DOCX y XLSX'
export const ARCHIVO_ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx'
export const ARCHIVO_EXTENSIONES = ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx'] as const
export const ARCHIVO_REQUISITOS = `Formatos permitidos: ${ARCHIVO_FORMATOS}. Tamaño máximo: ${ARCHIVO_MAX_MB} MB por archivo.`

export function rechazoArchivo(motivo: string): string {
  return `${motivo} ${ARCHIVO_REQUISITOS}`
}

/** Comprobación inmediata de la selección. Nunca reemplaza la detección binaria del servidor. */
export function errorSeleccionArchivo(archivo: { name: string; size: number }): string | null {
  if (!Number.isFinite(archivo.size) || archivo.size <= 0)
    return rechazoArchivo('El archivo está vacío o su tamaño no es válido. Elegí otro documento.')
  if (archivo.size > ARCHIVO_MAX_BYTES)
    return rechazoArchivo(`El archivo supera el máximo de ${ARCHIVO_MAX_MB} MB.`)
  const extension = archivo.name.split('.').pop()?.toLowerCase()
  if (!ARCHIVO_EXTENSIONES.some((permitida) => permitida === extension))
    return rechazoArchivo('La extensión del archivo no está permitida.')
  return null
}
