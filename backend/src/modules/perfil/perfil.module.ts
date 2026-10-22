import { env } from '../../config/env.ts'
import { crearCorreoCambioContrasena } from '../../lib/correo-cambio-contrasena.ts'
import { baseUsuarios } from '../usuarios/usuarios.module.ts'
import { requerirSesion } from '../auth/auth.module.ts'
import { crearPerfilRouter } from './perfil.routes.ts'
import { crearServicioPerfil } from './perfil.service.ts'

export const perfilRouter = crearPerfilRouter({
  servicio: crearServicioPerfil({
    base: baseUsuarios,
    enviarAvisoCambio: crearCorreoCambioContrasena({
      apiKey: env.RESEND_API_KEY,
      remitente: env.RESEND_FROM ?? env.MAIL_FROM ?? 'Estudio Cova <onboarding@resend.dev>',
    }),
  }),
  requerirSesion,
})
