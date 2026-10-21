import {
  filtrosSiniestrosSchema,
  type OpcionesSiniestros,
  type PaginaSiniestros,
  type PartesSiniestro,
} from '@cova/shared/schemas/siniestros'
import { api } from '@/lib/api'

// Filtros que entiende GET /api/siniestros. Lo demás de la dirección no se manda, y un valor inválido (una
// dirección editada a mano, un enlace viejo) se descarta en vez de romper la pantalla.
export const PARAMETROS_LISTADO = [
  'pagina',
  'porPagina',
  'q',
  'estado',
  'aseguradora',
  'gestor',
  'bajas',
  'orden',
] as const

export function listarSiniestros(params: URLSearchParams): Promise<PaginaSiniestros> {
  const consulta = new URLSearchParams()
  for (const clave of PARAMETROS_LISTADO) {
    const valor = params.get(clave)
    if (valor && filtrosSiniestrosSchema.shape[clave].safeParse(valor).success) {
      consulta.set(clave, valor)
    }
  }
  const texto = consulta.toString()
  return api(`/siniestros${texto ? `?${texto}` : ''}`)
}

export function opcionesSiniestros(): Promise<OpcionesSiniestros> {
  return api('/siniestros/opciones')
}

export function partesSiniestro(id: number): Promise<PartesSiniestro> {
  return api(`/siniestros/${id}/partes`)
}
