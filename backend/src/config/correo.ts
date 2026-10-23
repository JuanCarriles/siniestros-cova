import { env } from './env.ts'
import type { ConfigCorreo } from '../lib/correo-resend.ts'

export const configCorreo: ConfigCorreo = {
  apiKey: env.RESEND_API_KEY,
  remitente: env.RESEND_FROM ?? env.MAIL_FROM ?? 'Estudio Cova <onboarding@resend.dev>',
}
