import { DIAS_ALERTA } from '@cova/shared/schemas/siniestros'
import { TipoNotificacion } from '../../generated/prisma/client.ts'
import { formatearFecha } from '../../utils/formato.ts'
import type { Transaccion } from './partes-edicion.ts'
import { diasSinMovimiento, sinMovimiento } from './demora.ts'

/** Número del bloqueo de PostgreSQL de esta tarea: si dos procesos la corren a la vez, solo uno avisa */
const BLOQUEO_DEMORAS = 51_010

export type ResultadoDemoras = {
  /** false si otro proceso estaba revisando: esta vez no se hizo nada */
  revisado: boolean
  /** Casos que recibieron un aviso nuevo */
  casos: number
  /** Notificaciones creadas (una por destinatario y caso) */
  avisos: number
}

// RF-19 (E5-10): la tarea programada que avisa de los casos demorados. Recorre los abiertos (ni dados de baja ni
// cerrados) sin movimiento hace 72 horas o más y avisa al usuario asignado y a la administración activa:
// - a las 72 horas, "demorado" (CASO_DEMORADO, el semáforo en amarillo);
// - a los 7 días, "en alerta" (CASO_EN_ALERTA, el semáforo en rojo).
// Cada aviso sale una sola vez por período sin movimiento: lo enviado desde el último movimiento no se repite, y
// cuando el caso se mueve vuelve a empezar. Si la tarea estuvo parada y un caso ya pasó los 7 días sin aviso,
// recibe solo el de alerta. La demora en sí no se guarda: se calcula con la misma regla que el listado.
export function crearTareaDemoras({
  transaccion,
  reloj = () => new Date(),
}: {
  transaccion: Transaccion
  reloj?: () => Date
}) {
  return {
    async revisar(): Promise<ResultadoDemoras> {
      return transaccion(async (tx) => {
        const [bloqueo] = await tx.$queryRaw<{ libre: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${BLOQUEO_DEMORAS}) AS libre`
        if (!bloqueo?.libre) return { revisado: false, casos: 0, avisos: 0 }

        const ahora = reloj()
        const demorados = await tx.siniestro.findMany({
          where: {
            AND: [
              { eliminado: false, eliminacionEnCurso: false, estadoSiniestro: { esCierre: false } },
              sinMovimiento(ahora),
            ],
          },
          select: {
            id: true,
            numeroSiniestro: true,
            idUsuario: true,
            fechaUltimoMovimiento: true,
            fechaAsignacion: true,
          },
          orderBy: { id: 'asc' },
        })
        if (!demorados.length) return { revisado: true, casos: 0, avisos: 0 }

        const enviados = await tx.notificacion.findMany({
          where: {
            idSiniestro: { in: demorados.map((s) => s.id) },
            tipoNotificacion: {
              in: [TipoNotificacion.CASO_DEMORADO, TipoNotificacion.CASO_EN_ALERTA],
            },
          },
          select: { idSiniestro: true, tipoNotificacion: true, fechaCreacion: true },
        })
        const administracion = (
          await tx.usuario.findMany({
            where: {
              eliminado: false,
              tipoUsuario: { in: ['ADMINISTRADOR', 'SUPER_ADMINISTRADOR'] },
            },
            select: { id: true },
          })
        ).map((u) => u.id)
        const asignadosActivos = new Set(
          (
            await tx.usuario.findMany({
              where: {
                id: { in: [...new Set(demorados.map((s) => s.idUsuario))] },
                eliminado: false,
              },
              select: { id: true },
            })
          ).map((u) => u.id),
        )

        const avisos = demorados.flatMap((s) => {
          const desde = s.fechaUltimoMovimiento ?? s.fechaAsignacion
          const dias = diasSinMovimiento(ahora, s)
          const tipo =
            dias >= DIAS_ALERTA ? TipoNotificacion.CASO_EN_ALERTA : TipoNotificacion.CASO_DEMORADO
          const yaAvisado = enviados.some(
            (n) =>
              n.idSiniestro === s.id && n.tipoNotificacion === tipo && n.fechaCreacion >= desde,
          )
          if (yaAvisado) return []
          const referencia = s.fechaUltimoMovimiento
            ? `último movimiento el ${formatearFecha(desde)}`
            : `sin movimientos desde la asignación, el ${formatearFecha(desde)}`
          const mensaje =
            tipo === TipoNotificacion.CASO_EN_ALERTA
              ? `El siniestro ${s.numeroSiniestro} lleva ${dias} días sin movimiento (${referencia}): está en alerta.`
              : `El siniestro ${s.numeroSiniestro} está demorado: lleva ${dias} días sin movimiento (${referencia}).`
          const destinatarios = new Set([
            ...(asignadosActivos.has(s.idUsuario) ? [s.idUsuario] : []),
            ...administracion,
          ])
          return [...destinatarios].map((idUsuario) => ({
            idUsuario,
            idSiniestro: s.id,
            tipoNotificacion: tipo,
            mensaje,
            fechaCreacion: ahora,
            leida: false,
            revisada: false,
          }))
        })
        if (avisos.length) await tx.notificacion.createMany({ data: avisos })
        return {
          revisado: true,
          casos: new Set(avisos.map((a) => a.idSiniestro)).size,
          avisos: avisos.length,
        }
      })
    },
  }
}
