import { configCorreo } from '../../config/correo.ts'
import { crearCorreoCambioContrasena } from '../../lib/correo-cambio-contrasena.ts'
import { baseUsuarios } from '../usuarios/usuarios.module.ts'
import { requerirSesion } from '../auth/auth.module.ts'
import { crearPerfilRouter } from './perfil.routes.ts'
import { crearServicioPerfil } from './perfil.service.ts'

export const perfilRouter = crearPerfilRouter({
  servicio: crearServicioPerfil({
    base: baseUsuarios,
    enviarAvisoCambio: crearCorreoCambioContrasena(configCorreo),
  }),
  requerirSesion,
})
