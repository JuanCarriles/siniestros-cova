import { ApiError } from '@/lib/api'

/**
 * El campo que el servidor marcó en su error ({ campo: 'dominio' }), si es uno de los que el formulario muestra.
 * Si no, el error va arriba del formulario.
 */
export function campoDelError<C extends string>(err: unknown, campos: readonly C[]): C | null {
  const campo =
    err instanceof ApiError &&
    err.detalles &&
    typeof err.detalles === 'object' &&
    'campo' in err.detalles
      ? err.detalles.campo
      : null
  return campos.includes(campo as C) ? (campo as C) : null
}

export const mensajeDelError = (err: unknown, porDefecto: string) =>
  err instanceof ApiError ? err.message : porDefecto
