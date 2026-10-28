import type {
  AbogadoFicha,
  DocumentoFicha,
  EventoHistorialFicha,
  FichaSiniestro,
  NovedadFicha,
  PeritoFicha,
  VehiculosYPartesFicha,
} from '@cova/shared/schemas/ficha-siniestro'
import { api } from '@/lib/api'

// Ficha del siniestro (CU-10, E5-01): la cabecera con los datos del caso, y lo de cada pestaña por separado

export function obtenerFicha(id: number): Promise<FichaSiniestro> {
  return api(`/siniestros/${id}`)
}

export const pestanasFicha = {
  vehiculos: (id: number): Promise<VehiculosYPartesFicha> => api(`/siniestros/${id}/vehiculos`),
  abogados: (id: number): Promise<AbogadoFicha[]> => api(`/siniestros/${id}/abogados`),
  peritos: (id: number): Promise<PeritoFicha[]> => api(`/siniestros/${id}/peritos`),
  novedades: (id: number): Promise<NovedadFicha[]> => api(`/siniestros/${id}/novedades`),
  documentos: (id: number): Promise<DocumentoFicha[]> => api(`/siniestros/${id}/documentos`),
  historial: (id: number): Promise<EventoHistorialFicha[]> => api(`/siniestros/${id}/historial`),
}
