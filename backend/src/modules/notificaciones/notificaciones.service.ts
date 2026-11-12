import type { SesionUsuario } from '@cova/shared/schemas/auth'
import {
  consultaNotificacionesSchema,
  lecturasNotificacionesSchema,
  type ConsultaNotificaciones,
  type LecturasNotificaciones,
  type BandejaNotificaciones,
  type ResumenNotificaciones,
} from '@cova/shared/schemas/bandeja-notificaciones'
import type { Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'
import { mensajesSinLeerPor, textoMensajesSinLeer } from '../chat/sin-leer.ts'

type Base = {
  transaccion<T>(
    trabajo: (tx: Prisma.TransactionClient) => Promise<T>,
    opciones?: { isolationLevel: 'RepeatableRead' },
  ): Promise<T>
}
type Actor = Pick<SesionUsuario, 'id' | 'tipoUsuario'>
export function crearServicioNotificaciones(base: Base) {
  async function actorActual(tx: Prisma.TransactionClient, usuario: SesionUsuario) {
    const actor = await tx.usuario.findFirst({
      where: { id: usuario.id, eliminado: false },
      select: { id: true, tipoUsuario: true },
    })
    if (!actor) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
    return actor
  }
  const filtro = (usuario: Actor): Prisma.NotificacionWhereInput => ({
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
  async function marcar(
    usuario: SesionUsuario,
    id: number,
    data: Prisma.NotificacionUpdateManyMutationInput,
  ) {
    await base.transaccion(async (tx) => {
      let actor = await actorActual(tx, usuario)
      let cambios = data
      if (data.leida === false) {
        const aviso = await tx.notificacion.findFirst({
          where: { AND: [filtro(actor), { id }] },
          select: { idSiniestro: true, tipoNotificacion: true },
        })
        if (!aviso) throw new HttpError(404, 'La notificación no está disponible.')
        if (aviso.tipoNotificacion === 'MENSAJE_NUEVO') {
          // Mismo orden que envío y lectura de chat. Marcar un aviso viejo sin leer también debe agruparse.
          await tx.$queryRaw`SELECT "id" FROM "Siniestro" WHERE "id" = ${aviso.idSiniestro} FOR NO KEY UPDATE`
          actor = await actorActual(tx, usuario)
          const actual = await tx.notificacion.findFirst({
            where: { AND: [filtro(actor), { id }] },
            select: { fechaCreacion: true, siniestro: { select: { numeroSiniestro: true } } },
          })
          if (!actual) throw new HttpError(404, 'La notificación no está disponible.')
          const otros = {
            idUsuario: actor.id,
            idSiniestro: aviso.idSiniestro,
            tipoNotificacion: 'MENSAJE_NUEVO' as const,
            eliminado: false,
            leida: false,
            id: { not: id },
          }
          const ultimo = await tx.notificacion.aggregate({
            where: otros,
            _max: { fechaCreacion: true },
          })
          await tx.notificacion.updateMany({
            where: otros,
            data: { eliminado: true, fechaBaja: new Date() },
          })
          const cantidad = await tx.mensajeChat.count({
            where: { idSiniestro: aviso.idSiniestro, ...mensajesSinLeerPor(actor.id) },
          })
          cambios = {
            ...data,
            mensaje: textoMensajesSinLeer(cantidad, actual.siniestro.numeroSiniestro),
            fechaCreacion: new Date(
              Math.max(actual.fechaCreacion.getTime(), ultimo._max.fechaCreacion?.getTime() ?? 0),
            ),
          }
        }
      }
      const resultado = await tx.notificacion.updateMany({
        where: { AND: [filtro(actor), { id }] },
        data: cambios,
      })
      if (!resultado.count) throw new HttpError(404, 'La notificación no está disponible.')
    })
  }
  return {
    resumen(usuario: SesionUsuario): Promise<ResumenNotificaciones> {
      return base.transaccion(
        async (tx) => {
          const actor = await actorActual(tx, usuario)
          const visible = filtro(actor)
          const sinLeer = await tx.notificacion.count({
            where: { AND: [visible, { leida: false }] },
          })
          const sinRevisar = await tx.notificacion.count({
            where: { AND: [visible, { revisada: false }] },
          })
          return { sinLeer, sinRevisar }
        },
        { isolationLevel: 'RepeatableRead' },
      )
    },
    listar(
      usuario: SesionUsuario,
      entrada: ConsultaNotificaciones,
    ): Promise<BandejaNotificaciones> {
      const consulta = consultaNotificacionesSchema.parse(entrada)
      return base.transaccion(
        async (tx) => {
          const actor = await actorActual(tx, usuario)
          const visible = filtro(actor)
          const condiciones: Prisma.NotificacionWhereInput[] = [visible]
          if (consulta.tipo) condiciones.push({ tipoNotificacion: consulta.tipo })
          if (consulta.lectura !== 'todas')
            condiciones.push({ leida: consulta.lectura === 'leidas' })
          if (consulta.revision !== 'todas')
            condiciones.push({ revisada: consulta.revision === 'revisadas' })
          const where: Prisma.NotificacionWhereInput = { AND: condiciones }
          const totalGeneral = await tx.notificacion.count({ where: visible })
          const sinLeer = await tx.notificacion.count({
            where: { AND: [visible, { leida: false }] },
          })
          const sinRevisar = await tx.notificacion.count({
            where: { AND: [visible, { revisada: false }] },
          })
          const total =
            condiciones.length === 1 ? totalGeneral : await tx.notificacion.count({ where })
          const pagina = Math.min(consulta.pagina, Math.max(1, Math.ceil(total / 20)))
          const filas = await tx.notificacion.findMany({
            where,
            orderBy: [{ fechaCreacion: 'desc' }, { id: 'desc' }],
            take: 20,
            skip: (pagina - 1) * 20,
            select: {
              id: true,
              mensaje: true,
              fechaCreacion: true,
              tipoNotificacion: true,
              leida: true,
              revisada: true,
              siniestro: {
                select: { id: true, numeroSiniestro: true, idUsuario: true, eliminado: true },
              },
            },
          })
          return {
            total,
            totalGeneral,
            sinLeer,
            sinRevisar,
            pagina,
            porPagina: 20,
            items: filas.map((f) => {
              const puedeAbrirSiniestro =
                actor.tipoUsuario !== 'GESTOR' ||
                (f.siniestro.idUsuario === actor.id && !f.siniestro.eliminado)
              return {
                id: f.id,
                mensaje: f.mensaje,
                fecha: f.fechaCreacion.toISOString(),
                tipo: f.tipoNotificacion,
                leida: f.leida,
                revisada: f.revisada,
                siniestro: { id: f.siniestro.id, numeroSiniestro: f.siniestro.numeroSiniestro },
                puedeAbrirSiniestro,
                motivoSinAcceso: puedeAbrirSiniestro
                  ? null
                  : 'Este siniestro ya no está asignado a vos o está dado de baja. Podés consultar el aviso, pero no abrir el expediente.',
              }
            }),
          }
        },
        { isolationLevel: 'RepeatableRead' },
      )
    },
    // Leer nunca significa revisar. CU-08: abrir el expediente se registra mediante revisar(true).
    leer(usuario: SesionUsuario, id: number, leida = true) {
      return marcar(usuario, id, { leida })
    },
    revisar(usuario: SesionUsuario, id: number, revisada: boolean) {
      return marcar(usuario, id, { revisada, ...(revisada ? { leida: true } : {}) })
    },
    async leerVarias(usuario: SesionUsuario, entrada: LecturasNotificaciones) {
      const pedido = lecturasNotificacionesSchema.parse(entrada)
      await base.transaccion(async (tx) => {
        const actor = await actorActual(tx, usuario)
        await tx.notificacion.updateMany({
          where: {
            AND: [
              filtro(actor),
              { leida: false },
              ...('ids' in pedido ? [{ id: { in: pedido.ids } }] : []),
            ],
          },
          data: { leida: true },
        })
      })
    },
  }
}
