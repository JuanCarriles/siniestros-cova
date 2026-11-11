import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type {
  ConversacionChat,
  EnviarMensajeChatData,
  LecturasNuevasChat,
  MensajeChat,
  ResultadoLecturaChat,
  SinLeerChat,
} from '@cova/shared/schemas/chat'
import type { Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'
import { nombreCompleto } from '../../utils/formato.ts'
import { eventoHistorial } from '../historial/historial.textos.ts'
import { notificarMensajeNuevo } from '../notificaciones/notificaciones-mensaje.ts'
import { prepararEdicion, type Transaccion } from '../siniestros/partes-edicion.ts'
import { exigirAccesoSiniestro } from '../siniestros/siniestros-acceso.ts'
import { mensajesSinLeerPor } from './sin-leer.ts'

// CU-10 1.h y 1.h.1 (E7-02): el chat del siniestro, entre el gestor asignado y la administración (RF-25).
//
// - Enviar: se guarda con su autor (nombre y rol de ese momento) y la fecha y hora del servidor, va al historial y
//   avisa por la bandeja a los participantes que no tienen la conversación a la vista, agrupando los mensajes
//   nuevos en un solo aviso por siniestro (1.h.1.1). Todo en una transacción; recién después del commit se
//   reparte por la sala en tiempo real: nunca llega por el socket un mensaje que no quedó guardado.
// - Cerrado o dado de baja: la conversación se lee, pero no se escribe (las mismas reglas que las novedades).
// - Los mensajes no se editan ni se borran (RF-27): este servicio solo los agrega. No es movimiento del caso (E5-10).

const columnas = {
  id: true,
  idSiniestro: true,
  contenidoMensaje: true,
  fechaEnvio: true,
  claveEnvio: true,
  idUsuario: true,
  autor: true,
  tipoUsuarioAutor: true,
  // E7-03: quiénes lo leyeron y cuándo
  lecturas: {
    where: { eliminado: false },
    orderBy: [{ fechaLeido: 'asc' }, { id: 'asc' }],
    select: {
      fechaLeido: true,
      usuario: { select: { id: true, nombres: true, apellidos: true, tipoUsuario: true } },
    },
  },
} as const satisfies Prisma.MensajeChatSelect

type Fila = Prisma.MensajeChatGetPayload<{ select: typeof columnas }>

export function mensajeDe(fila: Fila): MensajeChat {
  return {
    id: fila.id,
    idSiniestro: fila.idSiniestro,
    texto: fila.contenidoMensaje,
    fechaEnvio: fila.fechaEnvio.toISOString(),
    claveEnvio: fila.claveEnvio,
    autor: { id: fila.idUsuario, nombre: fila.autor, tipoUsuario: fila.tipoUsuarioAutor },
    leidoPor: fila.lecturas
      .filter((l) => l.usuario.id !== fila.idUsuario)
      .map((l) => ({
        lector: {
          id: l.usuario.id,
          nombre: nombreCompleto(l.usuario),
          tipoUsuario: l.usuario.tipoUsuario,
        },
        fechaLeido: l.fechaLeido.toISOString(),
      })),
  }
}

export type DependenciasChat = {
  transaccion: Transaccion
  /** Quienes tienen la conversación a la vista (los da la capa de tiempo real) */
  presentes: (idSiniestro: number) => Iterable<number>
  /** Reparte un mensaje ya guardado a la sala del siniestro */
  repartir: (mensaje: MensajeChat) => Promise<void>
  /** E7-03: avisa a la sala que alguien leyó mensajes */
  repartirLecturas: (lecturas: LecturasNuevasChat) => Promise<void>
  reloj?: () => Date
}

export function crearServicioChat({
  transaccion,
  presentes,
  repartir,
  repartirLecturas,
  reloj = () => new Date(),
}: DependenciasChat) {
  /** El usuario activo, con el rol de la base, y su acceso al siniestro (igual que la ficha) */
  async function lector(tx: Prisma.TransactionClient, usuario: SesionUsuario, idSiniestro: number) {
    const actor = await tx.usuario.findFirst({
      where: { id: usuario.id, eliminado: false },
      select: { id: true, nombres: true, apellidos: true, tipoUsuario: true },
    })
    if (!actor) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
    await exigirAccesoSiniestro(tx, { ...usuario, tipoUsuario: actor.tipoUsuario }, idSiniestro)
    return actor
  }

  return {
    /** La conversación de la más vieja a la más nueva. Con `despues`, solo lo posterior a ese mensaje. */
    listar(
      usuario: SesionUsuario,
      idSiniestro: number,
      { despues }: { despues?: number } = {},
    ): Promise<ConversacionChat> {
      return transaccion(async (tx) => {
        // El rol vigente, no el que quedó en la sesión (igual que la ficha)
        await lector(tx, usuario, idSiniestro)
        const caso = await tx.siniestro.findUniqueOrThrow({
          where: { id: idSiniestro },
          select: { eliminado: true, estadoSiniestro: { select: { esCierre: true } } },
        })
        const filas = await tx.mensajeChat.findMany({
          where: { idSiniestro, eliminado: false, ...(despues ? { id: { gt: despues } } : {}) },
          orderBy: [{ fechaEnvio: 'asc' }, { id: 'asc' }],
          select: columnas,
        })
        return {
          mensajes: filas.map(mensajeDe),
          soloLectura: caso.eliminado
            ? 'El siniestro está dado de baja: podés leer la conversación, pero no enviar mensajes.'
            : caso.estadoSiniestro.esCierre
              ? 'El siniestro está cerrado: podés leer la conversación, pero no enviar mensajes.'
              : null,
        }
      })
    },

    async enviar(
      usuario: SesionUsuario,
      idSiniestro: number,
      { texto, claveEnvio }: EnviarMensajeChatData,
    ): Promise<MensajeChat> {
      const mensaje = await transaccion(async (tx) => {
        // Bloquea el siniestro, toma el rol y el responsable vigentes y rechaza un caso cerrado o dado de baja
        const autor = await prepararEdicion(tx, usuario, idSiniestro)
        // El mismo envío otra vez (se perdió la respuesta y el formulario reintentó): ya está guardado, sin repetir
        // historial ni avisos. El bloqueo del siniestro ordena dos envíos iguales a la vez.
        const previo = await tx.mensajeChat.findUnique({ where: { claveEnvio }, select: columnas })
        if (previo) {
          if (previo.idSiniestro !== idSiniestro || previo.idUsuario !== usuario.id)
            throw new HttpError(
              409,
              'No se pudo enviar el mensaje. Volvé a cargar la página y probá de nuevo.',
            )
          return mensajeDe(previo)
        }
        const ahora = reloj()
        const fila = await tx.mensajeChat.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            autor: nombreCompleto(autor),
            tipoUsuarioAutor: autor.tipoUsuario,
            contenidoMensaje: texto,
            claveEnvio,
            fechaEnvio: ahora,
          },
          select: columnas,
        })
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            fechaEvento: ahora,
            ...eventoHistorial.mensaje(autor, ahora),
          },
        })
        await notificarMensajeNuevo(tx, fila.id, { presentes: presentes(idSiniestro) })
        return mensajeDe(fila)
      })
      // Después del commit. Un reintento lo vuelve a repartir: si el primero se cortó antes de hacerlo, ahora llega;
      // si ya había llegado, el navegador lo reconoce por su id y no lo repite. Si falla, el mensaje igual quedó
      // guardado: los demás lo reciben al reconectar o al volver a entrar.
      await repartir(mensaje).catch((error: unknown) =>
        console.error('No se pudo repartir un mensaje del chat en tiempo real:', error),
      )
      return mensaje
    },

    /**
     * CU-10 1.h.3 (E7-03): el usuario entró a la conversación, o la está mirando cuando llega un mensaje. Marca como
     * leídos, con su usuario y la hora del servidor, los mensajes de otros que todavía no leyó; retira su aviso de
     * mensajes nuevos de este siniestro de la bandeja, y después del commit informa la lectura a la sala.
     * Leer también se puede en un caso cerrado o dado de baja: la conversación se sigue consultando.
     */
    /** Cuántos mensajes de otros no leyó todavía: el número de la pestaña del chat, al día en tiempo real */
    sinLeer(usuario: SesionUsuario, idSiniestro: number): Promise<SinLeerChat> {
      return transaccion(async (tx) => {
        const actor = await lector(tx, usuario, idSiniestro)
        return {
          sinLeer: await tx.mensajeChat.count({
            where: { idSiniestro, ...mensajesSinLeerPor(actor.id) },
          }),
        }
      })
    },

    async leer(usuario: SesionUsuario, idSiniestro: number): Promise<ResultadoLecturaChat> {
      const resultado = await transaccion(async (tx) => {
        const actor = await lector(tx, usuario, idSiniestro)
        const ahora = reloj()
        const pendientes = await tx.mensajeChat.findMany({
          where: { idSiniestro, ...mensajesSinLeerPor(actor.id) },
          select: { id: true },
          orderBy: { id: 'asc' },
        })
        // Dos pestañas pueden marcar a la vez: el único (mensaje, usuario) deja la primera lectura y no falla
        const { count: leidos } = pendientes.length
          ? await tx.lecturaMensajeChat.createMany({
              data: pendientes.map((m) => ({
                idMensajeChat: m.id,
                idUsuario: actor.id,
                fechaLeido: ahora,
              })),
              skipDuplicates: true,
            })
          : { count: 0 }
        const { count: avisosRetirados } = await tx.notificacion.updateMany({
          where: {
            idUsuario: actor.id,
            idSiniestro,
            tipoNotificacion: 'MENSAJE_NUEVO',
            eliminado: false,
          },
          data: { eliminado: true, fechaBaja: ahora },
        })
        return {
          leidos,
          avisosRetirados,
          lecturas: {
            idSiniestro,
            idsMensajes: pendientes.map((m) => m.id),
            lector: { id: actor.id, nombre: nombreCompleto(actor), tipoUsuario: actor.tipoUsuario },
            fechaLeido: ahora.toISOString(),
          } satisfies LecturasNuevasChat,
        }
      })
      if (resultado.leidos)
        await repartirLecturas(resultado.lecturas).catch((error: unknown) =>
          console.error('No se pudo avisar una lectura del chat en tiempo real:', error),
        )
      return resultado
    },
  }
}
