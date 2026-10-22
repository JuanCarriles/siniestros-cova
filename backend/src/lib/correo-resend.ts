export type ConfigCorreo = { apiKey?: string; remitente: string }
type MensajeCorreo = { email: string; asunto: string; html: string; texto: string }

// Transporte compartido: no registra claves, destinatarios ni respuestas privadas del proveedor.
export async function enviarCorreoResend(
  config: ConfigCorreo,
  mensaje: MensajeCorreo,
): Promise<void> {
  if (!config.apiKey) throw new Error('RESEND_API_KEY no configurada')
  const respuesta = await fetch('https://api.resend.com/emails', {
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
  if (!respuesta.ok) throw new Error(`Resend rechazó el envío (${respuesta.status})`)
}
