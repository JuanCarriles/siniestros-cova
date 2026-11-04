import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { NovedadData } from '@cova/shared/schemas/novedades'
import type { ParteCreada } from '@cova/shared/schemas/partes-siniestro'
import { TipoNotificacion } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'
import { nombreCompleto } from '../../utils/formato.ts'
import { eventoHistorial } from '../historial/historial.textos.ts'
import {
  prepararEdicion,
  registrarMovimiento,
  type Transaccion,
} from '../siniestros/partes-edicion.ts'

// CU-10 1.f.1 (E5-08): cargar una novedad desde la ficha. Queda con su autor y su fecha y hora, cuenta como
// movimiento del caso (RF-19), se registra en el historial y avisa a los involucrados: el usuario asignado y la
// administración activa, menos quien la cargó. Todo en una transacción. Las novedades no se editan ni se borran:
// este servicio solo las agrega.
export function crearServicioNovedadesGestion({ transaccion }: { transaccion: Transaccion }) {
  return {
    async cargar(
      usuario: SesionUsuario,
      idSiniestro: number,
      { descripcion, claveEnvio }: NovedadData,
    ): Promise<ParteCreada> {
      return transaccion(async (tx) => {
        // Acceso, bloqueo del siniestro y que no esté dado de baja ni cerrado: como los cambios de partes
        const autor = await prepararEdicion(tx, usuario, idSiniestro)
        // El mismo envío otra vez (se perdió la respuesta y el formulario reintentó): ya está cargada, sin repetir
        // historial ni avisos. El bloqueo del siniestro ordena dos envíos iguales a la vez.
        const previa = await tx.novedadSiniestro.findUnique({
          where: { claveEnvio },
          select: { id: true, idSiniestro: true, idUsuario: true },
        })
        if (previa) {
          if (previa.idSiniestro !== idSiniestro || previa.idUsuario !== usuario.id)
            throw new HttpError(
              409,
              'No se pudo cargar la novedad. Volvé a cargar la página y probá de nuevo.',
            )
          return { id: previa.id }
        }
        const siniestro = await tx.siniestro.findUniqueOrThrow({
          where: { id: idSiniestro },
          select: { numeroSiniestro: true, idUsuario: true },
        })
        const ahora = new Date()
        const { id } = await tx.novedadSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            autor: nombreCompleto(autor),
            tipoUsuarioAutor: autor.tipoUsuario,
            claveEnvio,
            descripcion,
            fechaCarga: ahora,
          },
          select: { id: true },
        })
        await registrarMovimiento(tx, idSiniestro, ahora)
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            fechaEvento: ahora,
            ...eventoHistorial.novedad(autor, ahora),
          },
        })
        const destinatarios = await tx.usuario.findMany({
          where: {
            eliminado: false,
            id: { not: usuario.id },
            OR: [
              { id: siniestro.idUsuario },
              { tipoUsuario: { in: ['ADMINISTRADOR', 'SUPER_ADMINISTRADOR'] } },
            ],
          },
          select: { id: true },
        })
        if (destinatarios.length)
          await tx.notificacion.createMany({
            data: destinatarios.map((d) => ({
              idUsuario: d.id,
              idSiniestro,
              tipoNotificacion: TipoNotificacion.NOVEDAD_CARGADA,
              mensaje: `${nombreCompleto(autor)} cargó una novedad en el siniestro ${siniestro.numeroSiniestro}`,
              fechaCreacion: ahora,
              leida: false,
              revisada: false,
            })),
          })
        return { id }
      })
    },
  }
}
