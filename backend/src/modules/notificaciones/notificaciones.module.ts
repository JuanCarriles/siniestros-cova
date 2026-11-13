import { getPrisma } from '../../lib/prisma.ts'
import { requerirSesion } from '../auth/auth.module.ts'
import { crearNotificacionesRouter } from './notificaciones.routes.ts'
import { crearServicioNotificaciones } from './notificaciones.service.ts'

export const notificacionesRouter = crearNotificacionesRouter({
  requerirSesion,
  servicio: crearServicioNotificaciones({
    // ReadCommitted por defecto para escrituras; solo las consultas piden una foto coherente.
    transaccion: (trabajo, opciones) => getPrisma().$transaction(trabajo, opciones),
  }),
})
