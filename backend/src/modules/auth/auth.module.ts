import { env } from '../../config/env.ts'
import { getPrisma } from '../../lib/prisma.ts'
import { crearRequerirSesion } from '../../middlewares/autenticar.ts'
import { crearAuthRouter } from './auth.routes.ts'
import { crearServicioAuth } from './auth.service.ts'
import { crearLimiteIntentos } from './limite-intentos.ts'
import { crearServicioSesiones } from './sesiones.service.ts'

// Arma el módulo de autenticación. Los demás módulos importan requerirSesion de acá:
//   router.get('/', requerirSesion, requerirRol('ADMINISTRADOR', 'SUPER_ADMINISTRADOR'), handler)

// Acceso diferido a la base: el cliente se crea en el primer pedido, no al importar (igual que /health)
const db = {
  get usuario() {
    return getPrisma().usuario
  },
  get sesion() {
    return getPrisma().sesion
  },
}

const DIEZ_MINUTOS = 10 * 60_000

export const sesiones = crearServicioSesiones({
  prisma: db,
  duracionMs: env.SESSION_TTL_HOURS * 3_600_000,
})

export const requerirSesion = crearRequerirSesion(sesiones)

const auth = crearServicioAuth({
  prisma: db,
  sesiones,
  // 15 fallidos con el mismo email en 10 minutos: 10 minutos de espera
  limitePorEmail: crearLimiteIntentos({
    maximo: 15,
    ventanaMs: DIEZ_MINUTOS,
    bloqueoMs: DIEZ_MINUTOS,
  }),
  // Más alto por IP: toda la oficina puede salir a internet por la misma
  limitePorIp: crearLimiteIntentos({
    maximo: 50,
    ventanaMs: DIEZ_MINUTOS,
    bloqueoMs: DIEZ_MINUTOS,
  }),
})

export const authRouter = crearAuthRouter({ auth, sesiones, requerirSesion })
