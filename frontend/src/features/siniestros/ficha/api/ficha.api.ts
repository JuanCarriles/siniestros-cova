import type {
  AbogadoFicha,
  DocumentoFicha,
  EventoHistorialFicha,
  FichaSiniestro,
  NovedadFicha,
  PeritoFicha,
  VehiculosYPartesFicha,
} from '@cova/shared/schemas/ficha-siniestro'
import type {
  AbogadoFichaData,
  AgregarPersona,
  ParteCreada,
} from '@cova/shared/schemas/partes-siniestro'
import type {
  OcupanteAltaData,
  OpcionesPartes,
  PeritoAltaData,
  PersonaExternaAltaData,
  TitularAltaData,
  VehiculoAltaData,
} from '@cova/shared/schemas/siniestros-alta'
import type { NovedadData } from '@cova/shared/schemas/novedades'
import type {
  ConversacionChat,
  EnviarMensajeChatData,
  MensajeChat,
  ResultadoLecturaChat,
  SinLeerChat,
} from '@cova/shared/schemas/chat'
import { api } from '@/lib/api'

// Ficha del siniestro (CU-10, E5-01): la cabecera con los datos del caso, y lo de cada pestaña por separado

export function obtenerFicha(id: number): Promise<FichaSiniestro> {
  return api(`/siniestros/${id}`)
}

export const pestanasFicha = {
  // Con los catálogos de los formularios para agregar y modificar (E5-06)
  vehiculos: async (id: number): Promise<VehiculosYPartesFicha & { opciones: OpcionesPartes }> => {
    const [partes, opciones] = await Promise.all([
      api<VehiculosYPartesFicha>(`/siniestros/${id}/vehiculos`),
      api<OpcionesPartes>('/siniestros/partes/opciones'),
    ])
    return { ...partes, opciones }
  },
  // Con las personas del siniestro, para elegir a quién representa (E5-07)
  abogados: async (
    id: number,
  ): Promise<{ abogados: AbogadoFicha[]; personas: VehiculosYPartesFicha }> => {
    const [abogados, personas] = await Promise.all([
      api<AbogadoFicha[]>(`/siniestros/${id}/abogados`),
      api<VehiculosYPartesFicha>(`/siniestros/${id}/vehiculos`),
    ])
    return { abogados, personas }
  },
  peritos: (id: number): Promise<PeritoFicha[]> => api(`/siniestros/${id}/peritos`),
  novedades: (id: number): Promise<NovedadFicha[]> => api(`/siniestros/${id}/novedades`),
  documentos: (id: number): Promise<DocumentoFicha[]> => api(`/siniestros/${id}/documentos`),
  historial: (id: number): Promise<EventoHistorialFicha[]> => api(`/siniestros/${id}/historial`),
  // E7-02: la conversación; lo que llegue después entra por el tiempo real
  chat: (id: number): Promise<ConversacionChat> => obtenerChat(id),
}

// ------------------------------------------------------------------ Vehículos y personas (CU-10 1.c, E5-06)

export const partes = {
  agregarVehiculo: (id: number, datos: VehiculoAltaData): Promise<ParteCreada> =>
    api(`/siniestros/${id}/vehiculos`, { method: 'POST', body: datos }),
  // revision: la que tenía al abrir el formulario. Si cambió, 409 (RegistroDesactualizado) y no se guarda nada.
  modificarVehiculo: (
    id: number,
    idVehiculo: number,
    revision: number,
    datos: VehiculoAltaData,
  ): Promise<void> =>
    api(`/siniestros/${id}/vehiculos/${idVehiculo}`, {
      method: 'PUT',
      body: { revision, datos },
    }),
  darDeBajaVehiculo: (id: number, idVehiculo: number): Promise<void> =>
    api(`/siniestros/${id}/vehiculos/${idVehiculo}/baja`, { method: 'PATCH' }),
  agregarPersona: (id: number, pedido: AgregarPersona): Promise<ParteCreada> =>
    api(`/siniestros/${id}/personas`, { method: 'POST', body: pedido }),
  modificarPersona: (
    id: number,
    idPersona: number,
    revision: number,
    datos: TitularAltaData | OcupanteAltaData | PersonaExternaAltaData,
  ): Promise<void> =>
    api(`/siniestros/${id}/personas/${idPersona}`, {
      method: 'PUT',
      body: { revision, datos },
    }),
  darDeBajaPersona: (id: number, idPersona: number): Promise<void> =>
    api(`/siniestros/${id}/personas/${idPersona}/baja`, { method: 'PATCH' }),
}

// ------------------------------------------------------------------ Abogados y peritos (CU-10 1.d y 1.e, E5-07)

/** cerrado lo deduce el schema de la fecha de cierre: no se manda */
const cuerpoPerito = ({ cerrado: _cerrado, ...datos }: PeritoAltaData) => datos

export const profesionales = {
  agregarAbogado: (id: number, datos: AbogadoFichaData): Promise<ParteCreada> =>
    api(`/siniestros/${id}/abogados`, { method: 'POST', body: datos }),
  modificarAbogado: (
    id: number,
    idAbogado: number,
    revision: number,
    datos: AbogadoFichaData,
  ): Promise<void> =>
    api(`/siniestros/${id}/abogados/${idAbogado}`, { method: 'PUT', body: { revision, datos } }),
  darDeBajaAbogado: (id: number, idAbogado: number): Promise<void> =>
    api(`/siniestros/${id}/abogados/${idAbogado}/baja`, { method: 'PATCH' }),
  agregarPerito: (id: number, datos: PeritoAltaData): Promise<ParteCreada> =>
    api(`/siniestros/${id}/peritos`, { method: 'POST', body: cuerpoPerito(datos) }),
  modificarPerito: (
    id: number,
    idPerito: number,
    revision: number,
    datos: PeritoAltaData,
  ): Promise<void> =>
    api(`/siniestros/${id}/peritos/${idPerito}`, {
      method: 'PUT',
      body: { revision, datos: cuerpoPerito(datos) },
    }),
  darDeBajaPerito: (id: number, idPerito: number): Promise<void> =>
    api(`/siniestros/${id}/peritos/${idPerito}/baja`, { method: 'PATCH' }),
}

// ------------------------------------------------------------------ Novedades (CU-10 1.f.1, E5-08)

/** Carga una novedad. No hay modificar ni dar de baja: las novedades no se editan ni se borran. */
export const cargarNovedad = (id: number, datos: NovedadData): Promise<ParteCreada> =>
  api(`/siniestros/${id}/novedades`, { method: 'POST', body: datos })

/** E7-02: la conversación del chat; con `despues`, solo lo posterior a ese mensaje (al reconectar) */
export const obtenerChat = (id: number, despues?: number): Promise<ConversacionChat> =>
  api(`/siniestros/${id}/chat${despues ? `?despues=${despues}` : ''}`)

/** E7-02: envía un mensaje; responde el mensaje guardado (el mismo si se reintenta con la misma clave) */
export const enviarMensajeChat = (id: number, datos: EnviarMensajeChatData): Promise<MensajeChat> =>
  api(`/siniestros/${id}/chat`, { method: 'POST', body: datos })

/** Cuántos mensajes de otros no leyó todavía (el número de la pestaña del chat) */
export const obtenerChatSinLeer = (id: number): Promise<SinLeerChat> =>
  api(`/siniestros/${id}/chat/sin-leer`)

/** E7-03: marca como leído lo pendiente de la conversación y retira el aviso de mensajes nuevos de la bandeja */
export const marcarChatLeido = (id: number): Promise<ResultadoLecturaChat> =>
  api(`/siniestros/${id}/chat/leidos`, { method: 'POST' })
