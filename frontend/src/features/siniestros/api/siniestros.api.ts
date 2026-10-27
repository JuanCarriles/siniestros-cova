import {
  parametrosListadoValidos,
  type OpcionesSiniestros,
  type ConfirmarSiniestro,
  type PaginaSiniestros,
  type PartesSiniestro,
  type SiniestroResumen,
} from '@cova/shared/schemas/siniestros'
import type {
  CrearSiniestroInput,
  DatosCasoData,
  DocumentoAlta,
  OpcionesAltaSiniestro,
  SiniestroCreado,
} from '@cova/shared/schemas/siniestros-alta'
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

export function darDeBajaSiniestro(id: number): Promise<void> {
  return api(`/siniestros/${id}/baja`, { method: 'PATCH' })
}
export function eliminarSiniestro(id: number, confirmacion: ConfirmarSiniestro): Promise<void> {
  return api(`/siniestros/${id}`, { method: 'DELETE', body: confirmacion })
}

// ------------------------------------------------------------------ Alta (E4-04)

export function opcionesAlta(): Promise<OpcionesAltaSiniestro> {
  return api('/siniestros/alta/opciones')
}

/** Paso 1: el servidor controla lo que depende de la base (número duplicado, ajustador de la aseguradora…). */
export function validarDatosCaso(datos: DatosCasoData): Promise<void> {
  return api('/siniestros/alta/datos-caso', { method: 'POST', body: datos })
}

// ------------------------------------------------------------------ Alta, paso 5 (E4-10)

/** Sube un documento del alta a R2 (todavía sin siniestro). De a uno. */
export function subirDocumentoAlta(archivo: File): Promise<DocumentoAlta> {
  const body = new FormData()
  body.set('archivo', archivo)
  return api('/siniestros/alta/documentos', { method: 'POST', body })
}

export function quitarDocumentoAlta(clave: string): Promise<void> {
  return api('/siniestros/alta/documentos', { method: 'DELETE', body: { clave } })
}

/** Crea el siniestro con todo lo cargado y avisa al asignado (CU-09 paso 36) */
export function crearSiniestro(alta: CrearSiniestroInput): Promise<SiniestroCreado> {
  return api('/siniestros/alta', { method: 'POST', body: alta })
}
