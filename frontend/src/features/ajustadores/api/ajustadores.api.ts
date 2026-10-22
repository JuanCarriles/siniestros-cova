import type { AjustadorData, AjustadorListado } from '@cova/shared/schemas/ajustadores'
import { api } from '@/lib/api'

// Trae todos (también los dados de baja): así el resumen y los filtros funcionan sin otro pedido
export function listarAjustadores(): Promise<AjustadorListado[]> {
  return api('/ajustadores?incluirBajas=true')
}

export function crearAjustador(datos: AjustadorData): Promise<AjustadorListado> {
  return api('/ajustadores', { method: 'POST', body: datos })
}

export function modificarAjustador(id: number, datos: AjustadorData): Promise<AjustadorListado> {
  return api(`/ajustadores/${id}`, { method: 'PATCH', body: datos })
}

export function darDeBajaAjustador(id: number): Promise<void> {
  return api(`/ajustadores/${id}/baja`, { method: 'PATCH' })
}

export function reactivarAjustador(id: number): Promise<void> {
  return api(`/ajustadores/${id}/reactivacion`, { method: 'PATCH' })
}
