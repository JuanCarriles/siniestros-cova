import type { Prisma } from '../../generated/prisma/client.ts'
import { mensajesSinLeerPor, textoMensajesSinLeer } from '../chat/sin-leer.ts'

type EventoCaso = {
  idSiniestro: number
  idUsuarioAsignado: number
  idAutor: number
  fecha: Date
  excluir?: number[]
} & (
  | { tipo: 'CAMBIO_ESTADO' | 'NOVEDAD_CARGADA'; mensaje: string }
  | { tipo: 'MENSAJE_NUEVO'; numeroSiniestro: string }
)

/** Dentro de la transacción del evento, después de bloquear el siniestro.
 * El chat conserva un solo aviso pendiente por destinatario y recalcula sus mensajes sin leer.
 */
export async function notificarEventoCaso(tx: Prisma.TransactionClient, evento: EventoCaso) {
  const destinatarios = await tx.usuario.findMany({
    where: {
      eliminado: false,
      id: { notIn: [evento.idAutor, ...(evento.excluir ?? [])] },
      OR: [
        { id: evento.idUsuarioAsignado },
        { tipoUsuario: { in: ['ADMINISTRADOR', 'SUPER_ADMINISTRADOR'] } },
      ],
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  })
  if (evento.tipo !== 'MENSAJE_NUEVO') {
    if (destinatarios.length)
      await tx.notificacion.createMany({
        data: destinatarios.map((d) => ({
          idUsuario: d.id,
          idSiniestro: evento.idSiniestro,
          tipoNotificacion: evento.tipo,
          mensaje: evento.mensaje,
          fechaCreacion: evento.fecha,
          leida: false,
          revisada: false,
        })),
      })
    return
  }
  for (const destinatario of destinatarios) {
    const cantidad = await tx.mensajeChat.count({
      where: { idSiniestro: evento.idSiniestro, ...mensajesSinLeerPor(destinatario.id) },
    })
    const data = {
      idUsuario: destinatario.id,
      idSiniestro: evento.idSiniestro,
      tipoNotificacion: evento.tipo,
      mensaje: textoMensajesSinLeer(cantidad, evento.numeroSiniestro),
      fechaCreacion: evento.fecha,
      leida: false,
      revisada: false,
    }
    const pendiente = await tx.notificacion.findFirst({
      where: {
        idUsuario: destinatario.id,
        idSiniestro: evento.idSiniestro,
        tipoNotificacion: 'MENSAJE_NUEVO',
        eliminado: false,
        leida: false,
      },
      select: { id: true, fechaCreacion: true },
    })
    if (pendiente) {
      const { count } = await tx.notificacion.updateMany({
        // La campana pudo leer el aviso mientras lo buscábamos: no resucitar ese grupo.
        where: { id: pendiente.id, eliminado: false, leida: false },
        data: {
          ...data,
          fechaCreacion: new Date(
            Math.max(pendiente.fechaCreacion.getTime(), evento.fecha.getTime()),
          ),
        },
      })
      if (count) continue
    }
    await tx.notificacion.create({ data })
  }
}
