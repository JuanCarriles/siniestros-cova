import { createHash, randomBytes } from 'node:crypto'
import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { Prisma } from '../../generated/prisma/client.ts'

type BaseSesiones = Pick<Prisma.TransactionClient, 'sesion'>

// Escribir la última actividad en cada pedido sería una escritura por request: se renueva como mucho una vez
// por minuto. El vencimiento real queda, a lo sumo, un minuto antes de las 7 h exactas.
const RENOVAR_CADA_MS = 60_000

export type ContextoSesion = { ip?: string; navegador?: string }

export type SesionValida = {
  usuario: SesionUsuario
  /** true si se corrió el vencimiento: hay que volver a enviar la cookie con el nuevo maxAge. */
  renovada: boolean
}

export type ServicioSesiones = ReturnType<typeof crearServicioSesiones>

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function crearServicioSesiones(deps: {
  prisma: BaseSesiones
  duracionMs: number
  ahora?: () => Date
}) {
  const { prisma, duracionMs, ahora = () => new Date() } = deps
  const vencimiento = (desde: Date) => new Date(desde.getTime() + duracionMs)

  return {
    duracionMs,

    /** Crea la sesión y devuelve el token para la cookie. En la base solo queda su hash. */
    async crear(idUsuario: number, contexto: ContextoSesion = {}): Promise<string> {
      const t = ahora()
      const token = randomBytes(32).toString('base64url')
      // Limpieza de paso: las sesiones vencidas ya no sirven para nada
      await prisma.sesion.deleteMany({ where: { fechaVencimiento: { lte: t } } })
      await prisma.sesion.create({
        data: {
          tokenHash: hashToken(token),
          idUsuario,
          fechaCreacion: t,
          ultimaActividad: t,
          fechaVencimiento: vencimiento(t),
          ip: contexto.ip?.slice(0, 64),
          navegador: contexto.navegador?.slice(0, 255),
        },
      })
      return token
    },

    /** Devuelve el usuario si el token corresponde a una sesión vigente de un usuario activo. */
    async validar(token: string): Promise<SesionValida | null> {
      const t = ahora()
      const sesion = await prisma.sesion.findUnique({
        where: { tokenHash: hashToken(token) },
        select: {
          id: true,
          ultimaActividad: true,
          fechaVencimiento: true,
          usuario: {
            select: {
              id: true,
              nombres: true,
              apellidos: true,
              email: true,
              tipoUsuario: true,
              eliminado: true,
            },
          },
        },
      })
      if (!sesion) return null
      if (sesion.fechaVencimiento <= t || sesion.usuario.eliminado) {
        await prisma.sesion.deleteMany({ where: { id: sesion.id } })
        return null
      }
      const renovada = t.getTime() - sesion.ultimaActividad.getTime() >= RENOVAR_CADA_MS
      if (renovada) {
        await prisma.sesion.update({
          where: { id: sesion.id },
          data: { ultimaActividad: t, fechaVencimiento: vencimiento(t) },
        })
      }
      const { eliminado: _eliminado, ...usuario } = sesion.usuario
      return { usuario, renovada }
    },

    /** Cierra esta sesión. */
    async revocar(token: string) {
      await prisma.sesion.deleteMany({ where: { tokenHash: hashToken(token) } })
    },

    /** Cierra todas las sesiones del usuario (baja, cambio de contraseña). */
    async revocarTodas(idUsuario: number) {
      await prisma.sesion.deleteMany({ where: { idUsuario } })
    },
  }
}
