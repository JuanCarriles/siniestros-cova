import type { SesionUsuario } from '@cova/shared/schemas/auth'
import {
  cambiarEstadoSiniestroSchema,
  type CambiarEstadoSiniestro,
  type OpcionesCambioEstado,
} from '@cova/shared/schemas/cambio-estado-siniestro'
import type { Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'
import { nombreCompleto } from '../../utils/formato.ts'
import { eventoHistorial } from '../historial/historial.textos.ts'

type Base = { transaccion<T>(trabajo: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> }
const detalleEstado = { id: true, nombre: true, descripcion: true, esCierre: true } as const

// Estado, movimiento, historial y avisos se confirman juntos; el bloqueo se comparte con bajas y borrado.
export function crearServicioEstadoSiniestro(base: Base, reloj = () => new Date()) {
  async function autorizar(tx: Prisma.TransactionClient, usuario: SesionUsuario) {
    const actor = await tx.usuario.findFirst({
      where: { id: usuario.id, eliminado: false },
      select: { id: true, nombres: true, apellidos: true, tipoUsuario: true },
    })
    if (!actor) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
    if (actor.tipoUsuario !== 'ADMINISTRADOR' && actor.tipoUsuario !== 'SUPER_ADMINISTRADOR')
      throw new HttpError(
        403,
        'Solo un administrador o superadministrador puede cambiar el estado del siniestro.',
      )
    return actor
  }
  async function buscar(tx: Prisma.TransactionClient, id: number) {
    const caso = await tx.siniestro.findUnique({
      where: { id },
      select: {
        id: true,
        numeroSiniestro: true,
        eliminado: true,
        eliminacionEnCurso: true,
        idUsuario: true,
        usuario: { select: { eliminado: true } },
        ajustador: { select: { eliminado: true } },
        estadoSiniestro: { select: detalleEstado },
      },
    })
    if (!caso) throw new HttpError(404, 'El siniestro no existe.')
    if (caso.eliminacionEnCurso)
      throw new HttpError(
        409,
        'El siniestro tiene una eliminación definitiva pendiente. No se puede cambiar su estado.',
      )
    if (caso.eliminado)
      throw new HttpError(
        409,
        'El siniestro está dado de baja. Reactivalo antes de cambiar su estado.',
      )
    return caso
  }
  return {
    opciones(usuario: SesionUsuario, id: number): Promise<OpcionesCambioEstado> {
      return base.transaccion(async (tx) => {
        await autorizar(tx, usuario)
        const caso = await buscar(tx, id)
        const estados = await tx.estadoSiniestro.findMany({
          where: { eliminado: false },
          select: detalleEstado,
          orderBy: { id: 'asc' },
        })
        return { estadoActual: caso.estadoSiniestro, estados }
      })
    },
    cambiar(usuario: SesionUsuario, id: number, datos: CambiarEstadoSiniestro): Promise<void> {
      const cambio = cambiarEstadoSiniestroSchema.parse(datos)
      return base.transaccion(async (tx) => {
        const actor = await autorizar(tx, usuario)
        await tx.$queryRaw`SELECT "id" FROM "Siniestro" WHERE "id" = ${id} FOR UPDATE`
        const caso = await buscar(tx, id)
        if (caso.estadoSiniestro.id !== cambio.idEstadoAnterior)
          throw new HttpError(
            409,
            'Otro usuario cambió el estado de este siniestro. Volvé a abrir Cambiar estado para consultar el estado actual.',
          )
        const nuevo = await tx.estadoSiniestro.findFirst({
          where: { id: cambio.idEstadoSiniestro, eliminado: false },
          select: detalleEstado,
        })
        if (!nuevo)
          throw new HttpError(
            400,
            'El estado seleccionado ya no está disponible. Volvé a consultar los estados.',
          )
        if (nuevo.id === caso.estadoSiniestro.id)
          throw new HttpError(409, 'El siniestro ya tiene ese estado. Elegí uno diferente.')
        if (!nuevo.esCierre && (caso.usuario.eliminado || caso.ajustador?.eliminado))
          throw new HttpError(
            409,
            'No se puede dejar activo un siniestro con un usuario o ajustador dado de baja. Reactivá o reasigná sus responsables primero.',
          )
        const ahora = reloj()
        await tx.siniestro.update({
          where: { id },
          data: {
            idEstadoSiniestro: nuevo.id,
            fechaUltimoMovimiento: ahora,
            demorado: false,
            fechaCierre: nuevo.esCierre ? ahora : null,
          },
        })
        await tx.historialSiniestro.create({
          data: {
            idSiniestro: id,
            idUsuario: actor.id,
            fechaEvento: ahora,
            ...eventoHistorial.cambioEstado(caso.estadoSiniestro.nombre, nuevo.nombre, ahora),
          },
        })
        // Usuarios internos involucrados: responsable actual y administración activa, sin avisarse a sí mismo.
        const destinatarios = await tx.usuario.findMany({
          where: {
            eliminado: false,
            id: { not: actor.id },
            OR: [
              { id: caso.idUsuario },
              { tipoUsuario: { in: ['ADMINISTRADOR', 'SUPER_ADMINISTRADOR'] } },
            ],
          },
          select: { id: true },
        })
        if (destinatarios.length)
          await tx.notificacion.createMany({
            data: destinatarios.map((destinatario) => ({
              idUsuario: destinatario.id,
              idSiniestro: id,
              tipoNotificacion: 'CAMBIO_ESTADO' as const,
              mensaje: `${nombreCompleto(actor)} cambió el siniestro ${caso.numeroSiniestro} de “${caso.estadoSiniestro.nombre}” a “${nuevo.nombre}”.`,
              fechaCreacion: ahora,
              leida: false,
              revisada: false,
            })),
          })
      })
    },
  }
}
