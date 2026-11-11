import { z } from 'zod'
import type { TipoUsuario } from './enums.ts'

// Chat del siniestro (CU-10 1.h, E7-02): conversación entre el gestor asignado y la administración (RF-25).
// Los mensajes no se editan ni se borran (RF-27): solo se agregan.

/** Largo máximo de un mensaje: el formulario muestra cuántos caracteres quedan */
export const MAXIMO_MENSAJE_CHAT = 2000

const vacio = 'Escribí el mensaje antes de enviarlo'

/** POST /api/siniestros/:id/chat. Lo mismo valida el formulario y el servidor. */
export const enviarMensajeChatSchema = z.strictObject({
  texto: z
    .string({ error: vacio })
    .trim()
    .min(1, vacio)
    .max(MAXIMO_MENSAJE_CHAT, `Usá como máximo ${MAXIMO_MENSAJE_CHAT} caracteres`),
  // La genera el formulario por cada mensaje y la repite si reintenta: el servidor no guarda dos veces el mismo envío
  claveEnvio: z.uuid({ error: 'Volvé a cargar la página y probá de nuevo.' }),
})
export type EnviarMensajeChatData = z.output<typeof enviarMensajeChatSchema>
export type EnviarMensajeChatInput = z.input<typeof enviarMensajeChatSchema>

/** GET /api/siniestros/:id/chat?despues=<id>: solo los mensajes posteriores (para recuperar después de un corte) */
export const consultaChatSchema = z.strictObject({
  despues: z.coerce.number().int().nonnegative().optional(),
})

/** Quién es, en una lectura (E7-03): nombre y rol actuales */
export type LectorChat = { id: number; nombre: string; tipoUsuario: TipoUsuario }

/** E7-03: un participante leyó el mensaje, y cuándo (RF-26) */
export type LecturaChat = { lector: LectorChat; fechaLeido: string }

/** E7-03 (chat:leido): un participante leyó estos mensajes al entrar o mientras miraba la conversación */
export type LecturasNuevasChat = {
  idSiniestro: number
  idsMensajes: number[]
  lector: LectorChat
  fechaLeido: string
}

/** POST /api/siniestros/:id/chat/leidos */
export type ResultadoLecturaChat = {
  /** Mensajes que quedaron marcados ahora (0 si no había nada sin leer) */
  leidos: number
  /** Avisos de mensajes nuevos del siniestro que se retiraron de la bandeja */
  avisosRetirados: number
  /** Lo que se marcó, para mostrarlo sin esperar el aviso del tiempo real */
  lecturas: LecturasNuevasChat
}

/** GET /api/siniestros/:id/chat/sin-leer: mensajes de otros que el usuario todavía no leyó */
export type SinLeerChat = { sinLeer: number }

/** Un mensaje, tal como lo muestra la conversación y como llega en tiempo real (chat:mensaje) */
export type MensajeChat = {
  id: number
  idSiniestro: number
  texto: string
  /** ISO 8601, del servidor */
  fechaEnvio: string
  /** La clave del envío: el navegador que lo mandó reconoce su propio mensaje cuando llega por el socket */
  claveEnvio: string | null
  autor: {
    id: number
    /** Nombre y apellido al enviarlo */
    nombre: string
    /** Rol al enviarlo */
    tipoUsuario: TipoUsuario | null
  }
  /** E7-03: quiénes lo leyeron (sin el autor), del primero al último */
  leidoPor: LecturaChat[]
}

export type ConversacionChat = {
  /** Del más viejo al más nuevo */
  mensajes: MensajeChat[]
  /** Cerrado o dado de baja: la conversación se lee, pero no se escribe. null si se puede escribir */
  soloLectura: string | null
}
