export type ConfigCorreo = { apiKey?: string; remitente: string }
type MensajeCorreo = { email: string; asunto: string; html: string; texto: string }

export class ErrorCorreoResend extends Error {
  constructor(tipo: 'configuracion' | 'rechazo' | 'tiempo' | 'red', estado?: number) {
    const mensajes = {
      configuracion: 'RESEND_API_KEY no configurada',
      rechazo: `Resend rechazó el envío (${estado})`,
      tiempo: 'Se agotó el tiempo de espera de Resend',
      red: 'No se pudo conectar con Resend',
    }
    super(mensajes[tipo])
    this.name = 'ErrorCorreoResend'
  }
}

// Solo errores construidos con mensajes controlados pueden incorporarse al log.
export function motivoFalloCorreo(error: unknown): string {
  return error instanceof ErrorCorreoResend
    ? error.message
    : 'Error desconocido del proveedor de correo'
}

export async function enviarCorreoResend(
  config: ConfigCorreo,
  mensaje: MensajeCorreo,
): Promise<void> {
  if (!config.apiKey) throw new ErrorCorreoResend('configuracion')
  let respuesta: Response
  try {
    respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: config.remitente,
        to: [mensaje.email],
        subject: mensaje.asunto,
        html: mensaje.html,
        text: mensaje.texto,
      }),
    })
  } catch (error) {
    const nombre = error instanceof Error ? error.name : ''
    throw new ErrorCorreoResend(
      nombre === 'TimeoutError' || nombre === 'AbortError' ? 'tiempo' : 'red',
    )
  }
  if (!respuesta.ok) throw new ErrorCorreoResend('rechazo', respuesta.status)
}
