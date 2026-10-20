import type { AseguradoraData, AseguradoraListado } from '@cova/shared/schemas/aseguradoras'
import { api } from '@/lib/api'

// Trae todas (también las dadas de baja): son pocas y así el resumen y el filtro funcionan sin otro pedido
export function listarAseguradoras(): Promise<AseguradoraListado[]> {
  return api('/aseguradoras?incluirBajas=true')
}

export function crearAseguradora(datos: AseguradoraData): Promise<AseguradoraListado> {
  return api('/aseguradoras', { method: 'POST', body: datos })
}

export function modificarAseguradora(
  id: number,
  datos: AseguradoraData,
): Promise<AseguradoraListado> {
  return api(`/aseguradoras/${id}`, { method: 'PATCH', body: datos })
}

export function darDeBajaAseguradora(id: number): Promise<void> {
  return api(`/aseguradoras/${id}/baja`, { method: 'PATCH' })
}

export function reactivarAseguradora(id: number): Promise<void> {
  return api(`/aseguradoras/${id}/reactivacion`, { method: 'PATCH' })
}
