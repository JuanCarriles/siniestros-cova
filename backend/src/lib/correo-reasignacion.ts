import { enviarCorreoResend, type ConfigCorreo } from './correo-resend.ts'
export type AvisoReasignacion = {
  email: string
  nombre: string
  numeroSiniestro: string
  anterior: string
  nuevo: string
  autor: string
  enlace: string
}
const escapar = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
export function crearCorreoReasignacion(config: ConfigCorreo) {
  return async (aviso: AvisoReasignacion) => {
    const texto = `Hola, ${aviso.nombre}. ${aviso.autor} reasignó el siniestro ${aviso.numeroSiniestro}. Responsable anterior: ${aviso.anterior}. Nuevo responsable: ${aviso.nuevo}.`
    await enviarCorreoResend(config, {
      email: aviso.email,
      asunto: `Reasignación del siniestro ${aviso.numeroSiniestro} · Estudio Cova`,
      texto: `${texto}\n\nAbrir el sistema: ${aviso.enlace}`,
      html: `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f3f4f6;color:#374151;font-family:Verdana,Tahoma,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:40px 16px"><table role="presentation" style="width:100%;max-width:560px"><tr><td style="padding:28px;border:1px solid #e5e7eb;border-top:5px solid #e8762c;border-radius:16px;background:#ffffff"><p style="color:#1e3a5f;font-weight:bold;text-align:center">ESTUDIO COVA</p><h1 style="color:#1e3a5f;font-size:26px;line-height:34px;text-align:center">Reasignación de siniestro</h1><p style="font-size:16px;line-height:27px">${escapar(texto)}</p><p style="text-align:center;margin-top:28px"><a href="${escapar(aviso.enlace)}" style="display:inline-block;background:#1e3a5f;color:#ffffff;padding:14px 24px;border-radius:8px;font-size:18px;text-decoration:none">Abrir el sistema</a></p><p style="font-size:16px;line-height:26px">El cambio quedó registrado en el historial y en tus notificaciones.</p></td></tr></table></td></tr></table></body></html>`,
    })
  }
}
