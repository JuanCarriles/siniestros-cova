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
const escapar = (texto: string) =>
  texto.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

export function crearCorreoReasignacion(config: ConfigCorreo) {
  return (a: AvisoReasignacion): Promise<void> => {
    const aviso = 'Ahora sos responsable de este siniestro.'
    const texto = `Hola, ${a.nombre}. ${aviso}\n${a.autor} reasignó el siniestro ${a.numeroSiniestro}.\nResponsable anterior: ${a.anterior}\nNuevo responsable: ${a.nuevo}\n\nVer en el sistema: ${a.enlace}`
    return enviarCorreoResend(config, {
      email: a.email,
      asunto: `Reasignación del siniestro ${a.numeroSiniestro} · Estudio Cova`,
      texto,
      html: `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#f3f4f6;color:#374151;font-family:Verdana,Tahoma,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
<tr><td align="center" style="padding:0 0 24px;color:#1e3a5f;font-size:20px;font-weight:bold;">ESTUDIO COVA</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-top:5px solid #e8762c;border-radius:16px;padding:28px 24px;">
<h1 style="margin:0 0 20px;color:#1e3a5f;font-size:26px;line-height:34px;text-align:center;">Reasignación de siniestro</h1>
<p style="font-size:16px;line-height:26px;">Hola, ${escapar(a.nombre)}. ${aviso}</p>
<p style="font-size:16px;line-height:26px;">${escapar(a.autor)} realizó el cambio en el siniestro <strong>${escapar(a.numeroSiniestro)}</strong>.</p>
<div style="padding:16px;background:#f2f6fb;border-radius:12px;font-size:16px;line-height:26px;">
<p style="margin:0 0 12px;">Responsable anterior<br><strong>${escapar(a.anterior)}</strong></p>
<p style="margin:0;">Nuevo responsable<br><strong>${escapar(a.nuevo)}</strong></p></div>
<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:24px auto 0;"><tr><td style="background:#1e3a5f;border-radius:10px;"><a href="${escapar(a.enlace)}" style="display:inline-block;padding:14px 24px;color:#ffffff;font-size:18px;font-weight:bold;text-decoration:none;">Ver el siniestro</a></td></tr></table>
</td></tr><tr><td align="center" style="padding:24px 8px;font-size:16px;line-height:24px;color:#4b5563;">El cambio también está disponible en las notificaciones del sistema.</td></tr>
</table></td></tr></table></body></html>`,
    })
  }
}
