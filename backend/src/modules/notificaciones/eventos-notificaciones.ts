import type { Prisma, TipoNotificacion } from '../../generated/prisma/client.ts'

type EventoCaso = {
  idSiniestro: number
  idUsuarioAsignado: number
  idAutor: number
  tipo: Extract<TipoNotificacion, 'CAMBIO_ESTADO' | 'NOVEDAD_CARGADA' | 'MENSAJE_NUEVO'>
  mensaje: string
  fecha: Date
}

/** Se ejecuta en la misma transacción que el evento, después de bloquear el siniestro.
 * Solo involucrados activos; un administrador asignado aparece una sola vez y el autor no recibe su aviso.
 * No envía correo. Los mensajes agrupan los pendientes por destinatario y siniestro (CU-10 1.h.1.1).
 */
export async function notificarEventoCaso(tx: Prisma.TransactionClient, evento: EventoCaso) {
  const destinatarios = await tx.usuario.findMany({
    where: {
      eliminado: false,
      id: { not: evento.idAutor },
      OR: [
        { id: evento.idUsuarioAsignado },
        { tipoUsuario: { in: ['ADMINISTRADOR', 'SUPER_ADMINISTRADOR'] } },
      ],
    },
    select: { id: true },
  })
  const avisos = destinatarios.map((destinatario) => ({
    idUsuario: destinatario.id,
    idSiniestro: evento.idSiniestro,
    tipoNotificacion: evento.tipo,
    mensaje: evento.mensaje,
    fechaCreacion: evento.fecha,
    leida: false,
    revisada: false,
  }))
  if (evento.tipo !== 'MENSAJE_NUEVO') {
    if (avisos.length) await tx.notificacion.createMany({ data: avisos })
    return
  }
  for (const data of avisos) {
    const pendiente = await tx.notificacion.findFirst({
      where: {
        idUsuario: data.idUsuario,
        idSiniestro: evento.idSiniestro,
        tipoNotificacion: 'MENSAJE_NUEVO',
        eliminado: false,
        leida: false,
      },
      orderBy: { id: 'desc' },
      select: { id: true, fechaCreacion: true },
    })
    if (pendiente) {
      // Un mensaje que obtuvo el bloqueo después puede haber sido creado antes.
      // La fecha del aviso agrupado siempre conserva el mensaje más reciente.
      await tx.notificacion.update({
        where: { id: pendiente.id },
        data: {
          ...data,
          fechaCreacion: new Date(
            Math.max(pendiente.fechaCreacion.getTime(), evento.fecha.getTime()),
          ),
        },
      })
      continue
    }
    await tx.notificacion.create({ data })
  }
}
