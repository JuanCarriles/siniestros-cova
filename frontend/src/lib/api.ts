// Cliente común para hablar con el backend (/api, mismo origen: en desarrollo lo redirige el proxy de Vite).
// La sesión viaja sola en la cookie httpOnly: el JavaScript nunca la lee ni la guarda.

export class ApiError extends Error {
  readonly status: number
  readonly detalles?: unknown

  constructor(status: number, message: string, detalles?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detalles = detalles
  }
}

export const MENSAJE_SIN_CONEXION =
  'No se pudo conectar con el servidor. Revisá tu conexión a internet y probá de nuevo.'

const MENSAJE_ERROR_SERVIDOR = 'Ocurrió un error en el servidor. Probá de nuevo en unos minutos.'

type Opciones = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /**
   * "requerida" (por defecto): si el servidor responde 401, la sesión venció; se vuelve al login avisándolo.
   * "opcional": el 401 se devuelve como error, para que quien llama decida (login, consulta de sesión).
   */
  sesion?: 'requerida' | 'opcional'
}

export function rutaLoginSesionVencida(volver = window.location.pathname + window.location.search) {
  return `/login?motivo=sesion-vencida&volver=${encodeURIComponent(volver)}`
}

export async function api<T = void>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const { method = 'GET', body, signal, sesion = 'requerida' } = opciones
  const esFormulario = body instanceof FormData
  let respuesta: Response
  try {
    respuesta = await fetch(`/api${ruta}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers:
        body === undefined || esFormulario ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : esFormulario ? body : JSON.stringify(body),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, MENSAJE_SIN_CONEXION)
  }

  if (respuesta.status === 204) return undefined as T
  const datos: unknown = await respuesta.json().catch(() => undefined)

  if (!respuesta.ok) {
    if (respuesta.status === 401 && sesion === 'requerida') {
      window.location.assign(rutaLoginSesionVencida())
    }
    const { error, details } = (datos ?? {}) as { error?: unknown; details?: unknown }
    throw new ApiError(
      respuesta.status,
      // Los 4xx traen un mensaje pensado para la persona; los 5xx, uno técnico que no le sirve
      respuesta.status < 500 && typeof error === 'string' ? error : MENSAJE_ERROR_SERVIDOR,
      details,
    )
  }
  return datos as T
}
