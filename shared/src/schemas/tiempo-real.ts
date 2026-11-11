// Contrato del canal en tiempo real (E7-01, CU-10 1.h): Socket.IO sobre el mismo origen que la API.
// El backend y el frontend tipan sus eventos con estas interfaces, así un nombre o un dato distinto no compila.

import type { MensajeChat } from './chat.ts'

/** Ruta del handshake. Nginx y el proxy de Vite la derivan al backend con Upgrade y Connection. */
export const RUTA_TIEMPO_REAL = '/socket.io'

/** connect_error.data.codigo cuando la cookie de sesión falta o venció: no tiene sentido reintentar. */
export const CODIGO_SESION_VENCIDA = 'SESION_VENCIDA'

export type DatosErrorConexion = { codigo: typeof CODIGO_SESION_VENCIDA }

/** Respuesta (ack) a sala:unirse. status usa los mismos códigos que la API: 401, 403 o 404. */
export type RespuestaSala = { ok: true } | { ok: false; status: number; error: string }

/** El servidor sacó al usuario de la sala: perdió el acceso al siniestro (reasignación, baja, cambio de rol). */
export type ExpulsionSala = { idSiniestro: number; motivo: string }

/** Eventos que manda el servidor. */
export interface EventosServidor {
  'sala:expulsado': (datos: ExpulsionSala) => void
  /** La sesión venció o se cerró (logout, baja del usuario, cambio de contraseña). Volver a ingresar. */
  'sesion:vencida': () => void
  /** E7-02: un mensaje nuevo del chat, después de guardarlo */
  'chat:mensaje': (mensaje: MensajeChat) => void
}

/** Eventos que manda el navegador. */
export interface EventosCliente {
  /** Entrar a la sala del siniestro. El servidor controla el acceso en la base antes de unir. */
  'sala:unirse': (idSiniestro: number, responder: (respuesta: RespuestaSala) => void) => void
  'sala:salir': (idSiniestro: number) => void
  /**
   * E7-02: si la conversación está a la vista (pestaña del navegador visible). Quien la está mirando no recibe el
   * aviso de mensajes nuevos en la bandeja: ya los ve llegar. Al unirse, se asume que sí.
   */
  'sala:atencion': (idSiniestro: number, visible: boolean) => void
}

export function salaSiniestro(idSiniestro: number) {
  return `siniestro:${idSiniestro}`
}
