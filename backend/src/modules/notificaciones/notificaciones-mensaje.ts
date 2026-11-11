import type { Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'
import { nombreCompleto } from '../../utils/formato.ts'
import { notificarEventoCaso } from './eventos-notificaciones.ts'

/** Aviso de mensajes nuevos del chat (CU-10 1.h.1 y 1.h.1.1).
 * Llamar después de persistir el mensaje, dentro de su misma transacción; nunca desde el navegador.
 * Los destinatarios, autor, caso y fecha salen de la base, no de un pedido del cliente.
 * presentes: quienes tienen la conversación abierta en ese momento (E7-02). Ya lo ven llegar: no reciben aviso.
 */
export async function notificarMensajeNuevo(
  tx: Prisma.TransactionClient,
  idMensaje: number,
  { presentes = [] }: { presentes?: Iterable<number> } = {},
) {
  const mensaje = await tx.mensajeChat.findFirst({
    where: { id: idMensaje, eliminado: false },
    select: {
      idSiniestro: true,
      idUsuario: true,
      fechaEnvio: true,
      usuario: { select: { nombres: true, apellidos: true, eliminado: true, tipoUsuario: true } },
    },
  })
  if (!mensaje || mensaje.usuario.eliminado)
    throw new HttpError(404, 'El mensaje no está disponible.')
  // NO KEY UPDATE serializa los avisos y es compatible con el KEY SHARE de la FK del mensaje recién insertado.
  // Dos envíos que ya insertaron su mensaje no se bloquean entre sí al convertir ese bloqueo.
  await tx.$queryRaw`SELECT "id" FROM "Siniestro" WHERE "id" = ${mensaje.idSiniestro} FOR NO KEY UPDATE`
  const caso = await tx.siniestro.findFirst({
    where: { id: mensaje.idSiniestro, eliminado: false, eliminacionEnCurso: false },
    select: { id: true, idUsuario: true, numeroSiniestro: true },
  })
  if (!caso) throw new HttpError(409, 'El siniestro no está disponible para recibir mensajes.')
  if (mensaje.usuario.tipoUsuario === 'GESTOR' && caso.idUsuario !== mensaje.idUsuario)
    throw new HttpError(403, 'El autor del mensaje no tiene acceso a este siniestro.')
  await notificarEventoCaso(tx, {
    idSiniestro: caso.id,
    idUsuarioAsignado: caso.idUsuario,
    idAutor: mensaje.idUsuario,
    tipo: 'MENSAJE_NUEVO',
    mensaje: `${nombreCompleto(mensaje.usuario)} envió mensajes nuevos en el siniestro ${caso.numeroSiniestro}.`,
    fecha: mensaje.fechaEnvio,
    excluir: [...presentes],
  })
}
