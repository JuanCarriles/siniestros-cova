import { enviarCorreoResend, type ConfigCorreo } from './correo-resend.ts'
import type { CorreoRecuperacion } from '../modules/auth/recuperacion.service.ts'

// HTML de correo con tablas y estilos inline para conservar la tarjeta en los clientes de email.
function tarjetaRecuperacion(codigo: string, minutos: number): string {
  const color = {
    navy: '#1e3a5f',
    acento: '#e8762c',
    fondo: '#f3f4f6',
    blanco: '#ffffff',
    texto: '#374151',
    secundario: '#4b5563',
    borde: '#e5e7eb',
    suave: '#f2f6fb',
  }
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recuperá tu contraseña · Estudio Cova</title>
</head>
<body style="margin:0;padding:0;background-color:${color.fondo};color:${color.texto};font-family:Verdana,Tahoma,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Tu código de recuperación vence en ${minutos} minutos. No lo compartas.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${color.fondo}" style="width:100%;background-color:${color.fondo};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;">
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr><td align="center" width="56" height="56" bgcolor="${color.acento}" style="width:56px;height:56px;border-radius:12px;background-color:${color.acento};color:${color.navy};font-size:22px;font-weight:bold;">EC</td></tr>
              </table>
              <p style="margin:16px 0 6px;color:${color.navy};font-size:20px;line-height:28px;font-weight:bold;letter-spacing:2px;">ESTUDIO COVA</p>
              <p style="margin:0;color:${color.secundario};font-size:16px;line-height:24px;">Gestión de siniestros</p>
            </td>
          </tr>
          <tr>
            <td bgcolor="${color.blanco}" style="background-color:${color.blanco};border:1px solid ${color.borde};border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(30,58,95,0.06);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr><td height="5" bgcolor="${color.acento}" style="height:5px;line-height:5px;background-color:${color.acento};border-radius:16px 16px 0 0;">&nbsp;</td></tr>
                <tr>
                  <td align="center" style="padding:32px 24px 28px;">
                    <p style="margin:0 0 12px;color:${color.secundario};font-size:16px;line-height:24px;">RECUPERACIÓN DE CONTRASEÑA</p>
                    <h1 style="margin:0 0 16px;color:${color.navy};font-size:28px;line-height:36px;font-weight:bold;">Volvé a tu espacio de trabajo</h1>
                    <p style="margin:0 0 24px;color:${color.texto};font-size:16px;line-height:26px;">Ingresá este código en la pantalla de recuperación para crear una contraseña nueva.</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${color.suave}" style="width:100%;background-color:${color.suave};border:1px solid ${color.borde};border-radius:12px;">
                      <tr>
                        <td align="center" style="padding:22px 8px;">
                          <p style="margin:0 0 10px;color:${color.secundario};font-size:16px;line-height:24px;">Tu código de verificación</p>
                          <p style="margin:0;color:${color.navy};font-family:Consolas,'Courier New',monospace;font-size:36px;line-height:48px;font-weight:bold;letter-spacing:6px;white-space:nowrap;">${codigo}</p>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:20px 0 0;color:${color.navy};font-size:16px;line-height:26px;"><strong>Vence en ${minutos} minutos</strong><br />Este código es de un solo uso.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;border-top:1px solid ${color.borde};">
                    <p style="margin:0 0 10px;color:${color.navy};font-size:16px;line-height:26px;font-weight:bold;">No compartas este código con nadie.</p>
                    <p style="margin:0;color:${color.secundario};font-size:16px;line-height:26px;">Si no solicitaste recuperar tu contraseña, podés ignorar este correo. Tu contraseña no cambió.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td align="center" style="padding:24px 12px 0;color:${color.secundario};font-size:16px;line-height:26px;">Estudio Cova S.R.T.<br />Mensaje automático de seguridad.</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// Conserva el mismo mensaje de recuperación y comparte el transporte con los avisos de seguridad.
export function crearCorreoRecuperacion(config: ConfigCorreo) {
  return async ({ email, codigo, minutos }: CorreoRecuperacion): Promise<void> => {
    await enviarCorreoResend(config, {
      email,
      asunto: 'Tu código para recuperar la contraseña · Estudio Cova',
      html: tarjetaRecuperacion(codigo, minutos),
      texto: `Estudio Cova\n\nTu código para recuperar la contraseña es: ${codigo}\n\nVence en ${minutos} minutos y sólo puede utilizarse una vez.\nSi no solicitaste este cambio, ignorá este mensaje. Tu contraseña no cambió.\n\nNo compartas este código con nadie.`,
    })
  }
}
