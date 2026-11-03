import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { BandejaNotificaciones } from '@cova/shared/schemas/bandeja-notificaciones'
import type { Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'

type Base = { transaccion<T>(trabajo: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> }
export function crearServicioNotificaciones(base: Base) {
  const filtro = (usuario: SesionUsuario): Prisma.NotificacionWhereInput => ({
    idUsuario: usuario.id,
    eliminado: false,
    siniestro: { eliminacionEnCurso: false },
    ...(usuario.tipoUsuario === 'GESTOR'
      ? {
          OR: [
            { siniestro: { idUsuario: usuario.id, eliminado: false } },
            { tipoNotificacion: 'REASIGNACION_SINIESTRO' as const },
          ],
        }
      : {}),
  })
  return {
    listar(usuario: SesionUsuario, pagina: number): Promise<BandejaNotificaciones> {
      return base.transaccion(async (tx) => {
        const where = filtro(usuario)
        const total = await tx.notificacion.count({ where })
        const sinLeer = await tx.notificacion.count({ where: { ...where, leida: false } })
        const actual = Math.min(pagina, Math.max(1, Math.ceil(total / 20)))
        const filas = await tx.notificacion.findMany({
          where,
          orderBy: [{ fechaCreacion: 'desc' }, { id: 'desc' }],
          take: 20,
          skip: (actual - 1) * 20,
          select: {
            id: true,
            mensaje: true,
            fechaCreacion: true,
            leida: true,
            siniestro: {
              select: { id: true, numeroSiniestro: true, idUsuario: true, eliminado: true },
            },
          },
        })
        return {
          total,
          sinLeer,
          pagina: actual,
          porPagina: 20,
          items: filas.map((f) => ({
            id: f.id,
            mensaje: f.mensaje,
            fecha: f.fechaCreacion.toISOString(),
            leida: f.leida,
            siniestro: { id: f.siniestro.id, numeroSiniestro: f.siniestro.numeroSiniestro },
            puedeAbrirSiniestro:
              usuario.tipoUsuario !== 'GESTOR' ||
              (f.siniestro.idUsuario === usuario.id && !f.siniestro.eliminado),
          })),
        }
      })
    },
    async leer(usuario: SesionUsuario, id: number) {
      await base.transaccion(async (tx) => {
        const resultado = await tx.notificacion.updateMany({
          where: { ...filtro(usuario), id },
          data: { leida: true, revisada: true },
        })
        if (!resultado.count) throw new HttpError(404, 'La notificación no está disponible.')
      })
    },
  }
}
