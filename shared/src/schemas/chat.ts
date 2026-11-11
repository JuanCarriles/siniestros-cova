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
}

export type ConversacionChat = {
  /** Del más viejo al más nuevo */
  mensajes: MensajeChat[]
  /** Cerrado o dado de baja: la conversación se lee, pero no se escribe. null si se puede escribir */
  soloLectura: string | null
}
