import type { SesionUsuario } from '@cova/shared/schemas/auth'
import {
  reasignarSiniestroSchema,
  type OpcionesReasignacion,
  type ResultadoReasignacion,
} from '@cova/shared/schemas/reasignacion-siniestro'
import { TipoNotificacion, Prisma } from '../../generated/prisma/client.ts'
import type { AvisoReasignacion } from '../../lib/correo-reasignacion.ts'
import { motivoFalloCorreo } from '../../lib/correo-resend.ts'
import { HttpError } from '../../utils/httpError.ts'
import { nombreCompleto } from '../../utils/formato.ts'
import { eventoHistorial } from '../historial/historial.textos.ts'

type Tx = Prisma.TransactionClient
type Deps = {
  transaccion<T>(trabajo: (tx: Tx) => Promise<T>): Promise<T>
  enviarAviso: (aviso: AvisoReasignacion) => Promise<void>
  urlSistema: string
}
const seleccionUsuario = {
  id: true,
  nombres: true,
  apellidos: true,
  email: true,
  tipoUsuario: true,
  eliminado: true,
} as const
async function autorizar(tx: Tx, usuario: SesionUsuario) {
  const actor = await tx.usuario.findFirst({
    where: { id: usuario.id, eliminado: false },
    select: seleccionUsuario,
  })
  if (!actor) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
  if (actor.tipoUsuario !== 'ADMINISTRADOR' && actor.tipoUsuario !== 'SUPER_ADMINISTRADOR')
    throw new HttpError(
      403,
      'Solo un administrador o superadministrador puede reasignar siniestros.',
    )
  return actor
}
async function obtenerCaso(tx: Tx, id: number) {
  const caso = await tx.siniestro.findUnique({
    where: { id },
    select: {
      id: true,
      numeroSiniestro: true,
      idUsuario: true,
      eliminado: true,
      eliminacionEnCurso: true,
      usuario: { select: seleccionUsuario },
    },
  })
  if (!caso) throw new HttpError(404, 'El siniestro no existe.')
  if (caso.eliminado || caso.eliminacionEnCurso)
    throw new HttpError(
      409,
      'No se puede reasignar un siniestro dado de baja o con una eliminación pendiente.',
    )
  return caso
}

export function crearServicioReasignacion(deps: Deps, reloj = () => new Date()) {
  return {
    opciones(usuario: SesionUsuario, id: number): Promise<OpcionesReasignacion> {
      return deps.transaccion(async (tx) => {
        await autorizar(tx, usuario)
        const caso = await obtenerCaso(tx, id)
        const usuarios = await tx.usuario.findMany({
          where: { eliminado: false, id: { not: caso.idUsuario } },
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            tipoUsuario: true,
            _count: {
              select: {
                siniestros: {
                  where: {
                    eliminado: false,
                    eliminacionEnCurso: false,
                    estadoSiniestro: { esCierre: false },
                  },
                },
              },
            },
          },
          orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }, { id: 'asc' }],
        })
        return {
          anterior: caso.usuario
            ? { id: caso.usuario.id, nombre: nombreCompleto(caso.usuario) }
            : null,
          usuarios: usuarios.map(({ _count, nombres, apellidos, ...u }) => ({
            ...u,
            nombre: nombreCompleto({ nombres, apellidos }),
            casosActivos: _count.siniestros,
          })),
        }
      })
    },

    async reasignar(
      usuario: SesionUsuario,
      id: number,
      cuerpo: unknown,
    ): Promise<ResultadoReasignacion> {
      const avisos = await deps.transaccion(async (tx) => {
        await autorizar(tx, usuario)
        // El mismo bloqueo que usan baja y eliminación: no se confirma contra una asignación desactualizada.
        await tx.$queryRaw`SELECT "id" FROM "Siniestro" WHERE "id" = ${id} FOR UPDATE`
        const caso = await obtenerCaso(tx, id)
        const datos = reasignarSiniestroSchema.parse(cuerpo)
        if (caso.idUsuario !== datos.idUsuarioAnterior)
          throw new HttpError(
            409,
            'Otro usuario cambió el responsable de este siniestro. Actualizá la lista y revisá la reasignación.',
            { codigo: 'ASIGNACION_DESACTUALIZADA' },
          )
        if (caso.idUsuario === datos.idUsuarioNuevo)
          throw new HttpError(
            409,
            'El siniestro ya está asignado a ese usuario. Elegí otro responsable.',
          )
        // Orden estable para evitar cruces entre reasignaciones y la baja de usuarios.
        const ids = [...new Set([usuario.id, caso.idUsuario, datos.idUsuarioNuevo])].sort(
          (a, b) => a - b,
        )
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Usuario" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`,
        )
        const actor = await autorizar(tx, usuario)
        const nuevo = await tx.usuario.findFirst({
          where: { id: datos.idUsuarioNuevo, eliminado: false },
          select: seleccionUsuario,
        })
        if (!nuevo)
          throw new HttpError(
            409,
            'El usuario elegido ya no está activo. Actualizá la lista y elegí otro.',
            { codigo: 'USUARIO_NO_DISPONIBLE' },
          )
        const ahora = reloj()
        const anterior = caso.usuario
        const nombreAnterior = anterior ? nombreCompleto(anterior) : 'Sin responsable'
        const nombreNuevo = nombreCompleto(nuevo)
        const autor = nombreCompleto(actor)
        await tx.siniestro.update({
          where: { id },
          data: { idUsuario: nuevo.id, fechaUltimoMovimiento: ahora, demorado: false },
        })
        await tx.historialSiniestro.create({
          data: {
            idSiniestro: id,
            idUsuario: actor.id,
            fechaEvento: ahora,
            ...eventoHistorial.reasignacionPor(actor, nombreAnterior, nombreNuevo, ahora),
          },
        })
        const destinatarios = [...(anterior ? [anterior] : []), nuevo]
        await tx.notificacion.createMany({
          data: destinatarios.map((u) => ({
            idUsuario: u.id,
            idSiniestro: id,
            tipoNotificacion: TipoNotificacion.REASIGNACION_SINIESTRO,
            mensaje: `${autor} reasignó el siniestro ${caso.numeroSiniestro} de ${nombreAnterior} a ${nombreNuevo}.`,
            leida: false,
            revisada: false,
            fechaCreacion: ahora,
          })),
        })
        return destinatarios.map((u): AvisoReasignacion => ({
          email: u.email,
          nombre: nombreCompleto(u),
          numeroSiniestro: caso.numeroSiniestro,
          anterior: nombreAnterior,
          nuevo: nombreNuevo,
          autor,
          enlace: `${deps.urlSistema.replace(/\/$/, '')}/siniestros${u.id === nuevo.id || u.tipoUsuario !== 'GESTOR' ? `/${id}` : ''}`,
          esNuevoResponsable: u.id === nuevo.id,
        }))
      })
      // El proveedor se invoca después del commit: un mail fallido nunca duplica ni revierte la reasignación.
      const envios = await Promise.allSettled(
        avisos.map((a) => Promise.resolve().then(() => deps.enviarAviso(a))),
      )
      for (const envio of envios)
        if (envio.status === 'rejected')
          console.error(
            'No se pudo enviar un aviso de reasignación:',
            motivoFalloCorreo(envio.reason),
          )
      return { correosEnviados: envios.every((e) => e.status === 'fulfilled') }
    },
  }
}
