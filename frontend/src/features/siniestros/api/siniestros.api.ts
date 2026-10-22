import {
  parametrosListadoValidos,
  type OpcionesSiniestros,
  type PaginaSiniestros,
  type PartesSiniestro,
  type SiniestroResumen,
} from '@cova/shared/schemas/siniestros'
import { api } from '@/lib/api'

export function listarSiniestros(params: URLSearchParams): Promise<PaginaSiniestros> {
  const texto = new URLSearchParams(parametrosListadoValidos(params)).toString()
  return api(`/siniestros${texto ? `?${texto}` : ''}`)
}

export function opcionesSiniestros(): Promise<OpcionesSiniestros> {
  return api('/siniestros/opciones')
}

export function partesSiniestro(id: number): Promise<PartesSiniestro> {
  return api(`/siniestros/${id}/partes`)
}

export function obtenerSiniestro(id: number): Promise<SiniestroResumen> {
  return api(`/siniestros/${id}`)
}
