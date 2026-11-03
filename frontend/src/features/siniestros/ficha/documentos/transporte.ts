import {
  DOCUMENTO_MAX_BYTES,
  documentoSubidoSchema,
  errorArchivoDocumento,
} from '@cova/shared/schemas/documentos'
import { ApiError, rutaLoginSesionVencida } from '../../../../lib/api.ts'

export type ArchivoPreparado = { contenido: Blob; compresion: 'gzip' | 'identity' }
export async function comprimirDocumento(
  archivo: File,
  signal: AbortSignal,
): Promise<ArchivoPreparado> {
  const error = errorArchivoDocumento(archivo)
  if (error) throw new ApiError(400, error)
  signal.throwIfAborted()
  if (typeof CompressionStream === 'undefined')
    throw new ApiError(
      400,
      'Tu navegador no permite comprimir archivos. Actualizalo o usá otro navegador.',
    )
  const comprimido = await new Response(
    archivo.stream().pipeThrough(new CompressionStream('gzip')),
  ).blob()
  signal.throwIfAborted()
  // No agrandar un PDF/Office/imagen que ya está comprimido. El original siempre cumple el máximo.
  return comprimido.size < archivo.size && comprimido.size <= DOCUMENTO_MAX_BYTES
    ? { contenido: comprimido, compresion: 'gzip' }
    : { contenido: archivo, compresion: 'identity' }
}

export function enviarDocumento(
  idSiniestro: number,
  idCarga: string,
  archivo: File,
  preparado: ArchivoPreparado,
  progreso: (valor: number) => void,
  guardando: () => void,
  signal: AbortSignal,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const abortar = () => xhr.abort()
    function terminar() {
      signal.removeEventListener('abort', abortar)
    }
    xhr.open('POST', `/api/siniestros/${idSiniestro}/documentos`)
    xhr.withCredentials = true
    xhr.timeout = 120_000
    xhr.setRequestHeader('X-Id-Carga', idCarga)
    xhr.setRequestHeader('X-Archivo-Compresion', preparado.compresion)
    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable)
        progreso(Math.min(99, Math.floor((evento.loaded / evento.total) * 100)))
    }
    xhr.upload.onload = () => {
      progreso(99)
      guardando()
    }
    xhr.onerror = () => {
      terminar()
      reject(new ApiError(0, 'No se pudo conectar con el servidor. Reintentá este archivo.'))
    }
    xhr.ontimeout = () => {
      terminar()
      reject(
        new ApiError(408, 'La carga tardó demasiado. Podés reintentar sin duplicar el documento.'),
      )
    }
    xhr.onabort = () => {
      terminar()
      reject(new DOMException('Carga cancelada', 'AbortError'))
    }
    xhr.onload = () => {
      terminar()
      let datos: unknown
      try {
        datos = JSON.parse(xhr.responseText)
      } catch {
        datos = null
      }
      if (xhr.status === 401) window.location.assign(rutaLoginSesionVencida())
      if (xhr.status < 200 || xhr.status >= 300) {
        const error = datos && typeof datos === 'object' && 'error' in datos ? datos.error : null
        reject(
          new ApiError(
            xhr.status,
            xhr.status < 500 && typeof error === 'string'
              ? error
              : 'No se pudo guardar el archivo. Reintentá esta carga.',
          ),
        )
        return
      }
      const validado = documentoSubidoSchema.safeParse(datos)
      if (!validado.success) {
        reject(
          new ApiError(503, 'No se pudo confirmar la carga. Reintentá sin duplicar el documento.'),
        )
        return
      }
      resolve(validado.data.id)
    }
    if (signal.aborted) {
      reject(new DOMException('Carga cancelada', 'AbortError'))
      return
    }
    signal.addEventListener('abort', abortar, { once: true })
    const formulario = new FormData()
    formulario.append('archivo', preparado.contenido, archivo.name)
    xhr.send(formulario)
  })
}
