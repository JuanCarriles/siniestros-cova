import { enviarCorreoResend, type ConfigCorreo } from './correo-resend.ts'

// Sin contraseñas, códigos ni tokens. La tarjeta usa tablas y estilos inline para clientes de correo.
const html = `<!doctype html>
<html lang="es">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Contraseña actualizada · Estudio Cova</title></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;color:#374151;font-family:Verdana,Tahoma,sans-serif;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f4f6;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;">
        <tr><td align="center" style="padding:0 0 24px;">
          <p style="margin:0;color:#1e3a5f;font-size:20px;line-height:28px;font-weight:bold;letter-spacing:2px;">ESTUDIO COVA</p>
          <p style="margin:8px 0 0;color:#4b5563;font-size:16px;line-height:24px;">Gestión de siniestros</p>
        </td></tr>
        <tr><td style="border:1px solid #e5e7eb;border-top:5px solid #e8762c;border-radius:16px;background-color:#ffffff;padding:32px 24px;">
          <h1 style="margin:0 0 20px;color:#1e3a5f;font-size:28px;line-height:36px;text-align:center;">Tu contraseña cambió</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:26px;">Se actualizó la contraseña de tu cuenta de Estudio Cova.</p>
          <p style="margin:0 0 24px;font-size:16px;line-height:26px;">Por seguridad, cerramos todas tus sesiones. Para volver a ingresar, usá tu nueva contraseña.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f2f6fb;border-radius:12px;">
            <tr><td style="padding:20px;">
              <h2 style="margin:0 0 10px;color:#1e3a5f;font-size:20px;line-height:28px;">¿No hiciste este cambio?</h2>
              <p style="margin:0;font-size:16px;line-height:26px;">Recuperá tu contraseña desde la pantalla de ingreso y contactá al administrador del estudio de inmediato.</p>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;color:#4b5563;font-size:16px;line-height:26px;">Nunca compartas tu contraseña. El equipo de Estudio Cova no te la pedirá por correo.</p>
        </td></tr>
        <tr><td align="center" style="padding:24px 12px 0;color:#4b5563;font-size:16px;line-height:26px;">Estudio Cova S.R.T.<br />Aviso automático de seguridad.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

export function crearCorreoCambioContrasena(config: ConfigCorreo) {
  return (email: string): Promise<void> =>
    enviarCorreoResend(config, {
      email,
      asunto: 'Tu contraseña cambió · Estudio Cova',
      html,
      texto:
        'Estudio Cova\n\nSe actualizó la contraseña de tu cuenta y cerramos todas tus sesiones. Para volver a ingresar, usá tu nueva contraseña.\n\nSi no hiciste este cambio, recuperá tu contraseña desde la pantalla de ingreso y contactá al administrador del estudio de inmediato.\n\nNunca compartas tu contraseña. El equipo de Estudio Cova no te la pedirá por correo.',
    })
}
