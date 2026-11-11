import { enviarCorreoResend, type ConfigCorreo } from './correo-resend.ts'

export type AvisoActivacion = { email: string; nombre: string; enlace: string }
const escapar = (texto: string) =>
  texto.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

/** Preparado para conectar cuando exista la operación de activación.
 * No se conecta al alta o reactivación administrativa: todavía no son un flujo de activación de cuenta.
 * Nunca envía contraseñas ni inventa tokens de activación.
 */
export function crearCorreoActivacion(config: ConfigCorreo) {
  return (aviso: AvisoActivacion) =>
    enviarCorreoResend(config, {
      email: aviso.email,
      asunto: 'Tu cuenta está activa · Estudio Cova',
      texto: `Hola, ${aviso.nombre}. Tu cuenta de Estudio Cova ya está activa.\nIngresá al sistema: ${aviso.enlace}\nSi no recordás tu contraseña, usá Recuperar contraseña en la pantalla de ingreso.`,
      html: `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f4f6;color:#374151;font-family:Verdana,Tahoma,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px"><tr><td align="center" style="padding-bottom:24px;color:#1e3a5f;font-size:20px;font-weight:bold">ESTUDIO COVA</td></tr><tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-top:5px solid #e8762c;border-radius:16px;padding:28px 24px"><h1 style="color:#1e3a5f;font-size:26px;line-height:34px;text-align:center">Tu cuenta está activa</h1><p style="font-size:18px;line-height:28px">Hola, ${escapar(aviso.nombre)}. Ya podés ingresar a Estudio Cova.</p><p style="text-align:center;margin:28px 0"><a href="${escapar(aviso.enlace)}" style="display:inline-block;padding:14px 24px;background:#1e3a5f;color:#ffffff;border-radius:10px;font-size:18px;text-decoration:none;font-weight:bold">Ingresar al sistema</a></p><p style="font-size:16px;line-height:26px">Si no recordás tu contraseña, usá Recuperar contraseña en la pantalla de ingreso.</p></td></tr></table></td></tr></table></body></html>`,
    })
}
