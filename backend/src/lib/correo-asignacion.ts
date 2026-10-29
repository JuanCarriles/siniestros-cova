import { enviarCorreoResend, type ConfigCorreo } from './correo-resend.ts'

export type AvisoAsignacion = {
  email: string
  /** Nombre de quien recibe el caso */
  nombre: string
  numeroSiniestro: string
  aseguradora: string
  /** Quién lo asignó */
  asignadoPor: string
  /** Enlace al siniestro en el sistema */
  enlace: string
}

// Los datos del caso los escribe un usuario: se escapan antes de ir al HTML
const escapar = (texto: string) =>
  texto.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

// CU-09 paso 36: aviso por mail al usuario asignado. Tarjeta con tablas y estilos inline, como los demás correos.
function html(a: AvisoAsignacion) {
  const dato = (etiqueta: string, valor: string) =>
    `<tr><td style="padding:6px 0;color:#4b5563;font-size:16px;line-height:24px;width:120px;vertical-align:top;">${etiqueta}</td><td style="padding:6px 0;color:#1e3a5f;font-size:16px;line-height:24px;font-weight:bold;">${escapar(valor)}</td></tr>`
  return `<!doctype html>
<html lang="es">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Nuevo siniestro asignado · Estudio Cova</title></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;color:#374151;font-family:Verdana,Tahoma,sans-serif;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f4f6;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;">
        <tr><td align="center" style="padding:0 0 24px;">
          <p style="margin:0;color:#1e3a5f;font-size:20px;line-height:28px;font-weight:bold;letter-spacing:2px;">ESTUDIO COVA</p>
          <p style="margin:8px 0 0;color:#4b5563;font-size:16px;line-height:24px;">Gestión de siniestros</p>
        </td></tr>
        <tr><td style="border:1px solid #e5e7eb;border-top:5px solid #e8762c;border-radius:16px;background-color:#ffffff;padding:32px 24px;">
          <h1 style="margin:0 0 20px;color:#1e3a5f;font-size:28px;line-height:36px;text-align:center;">Tenés un siniestro nuevo</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:26px;">Hola, ${escapar(a.nombre)}. ${escapar(a.asignadoPor)} te asignó un siniestro.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f2f6fb;border-radius:12px;">
            <tr><td style="padding:16px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                ${dato('Siniestro', a.numeroSiniestro)}
                ${dato('Aseguradora', a.aseguradora)}
              </table>
            </td></tr>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:28px auto 0;">
            <tr><td style="border-radius:10px;background-color:#1e3a5f;">
              <a href="${escapar(a.enlace)}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:18px;line-height:24px;font-weight:bold;text-decoration:none;">Ver el siniestro</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:24px 12px 0;color:#4b5563;font-size:16px;line-height:26px;">Estudio Cova S.R.T.<br />Aviso automático: también lo vas a ver en las notificaciones del sistema.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function crearCorreoAsignacion(config: ConfigCorreo) {
  return (a: AvisoAsignacion): Promise<void> =>
    enviarCorreoResend(config, {
      email: a.email,
      asunto: `Se te asignó el siniestro ${a.numeroSiniestro} · Estudio Cova`,
      html: html(a),
      texto: `Estudio Cova\n\nHola, ${a.nombre}. ${a.asignadoPor} te asignó un siniestro.\n\nSiniestro: ${a.numeroSiniestro}\nAseguradora: ${a.aseguradora}\n\nVer el siniestro: ${a.enlace}\n\nTambién lo vas a ver en las notificaciones del sistema.`,
    })
}
