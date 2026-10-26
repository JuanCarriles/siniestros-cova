import {
  parametrosListadoValidos,
  type OpcionesSiniestros,
  type PaginaSiniestros,
  type PartesSiniestro,
  type SiniestroResumen,
} from '@cova/shared/schemas/siniestros'
import type { DatosCasoData, OpcionesAltaSiniestro } from '@cova/shared/schemas/siniestros-alta'
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

// ------------------------------------------------------------------ Alta (E4-04)

export function opcionesAlta(): Promise<OpcionesAltaSiniestro> {
  return api('/siniestros/alta/opciones')
}

/** Paso 1: el servidor controla lo que depende de la base (número duplicado, ajustador de la aseguradora…). */
export function validarDatosCaso(datos: DatosCasoData): Promise<void> {
  return api('/siniestros/alta/datos-caso', { method: 'POST', body: datos })
}
