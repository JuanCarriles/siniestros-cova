import type { Server as ServidorHttp } from 'node:http'
import { Server, type Socket } from 'socket.io'
import type { SesionUsuario } from '@cova/shared/schemas/auth'
import { idSchema } from '@cova/shared/schemas/comunes'
import {
  CODIGO_SESION_VENCIDA,
  RUTA_TIEMPO_REAL,
  salaSiniestro,
  type EventosCliente,
  type EventosServidor,
  type RespuestaSala,
} from '@cova/shared/schemas/tiempo-real'
import { NOMBRE_COOKIE_SESION } from '../../config/cookies.ts'
import type { Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'
import type { ServicioSesiones } from '../auth/sesiones.service.ts'
import { exigirAccesoSiniestro } from '../siniestros/siniestros-acceso.ts'

// E7-01 (CU-10 1.h): conexión en tiempo real autenticada, con una sala por siniestro.
//
// - El handshake lee la cookie de sesión (la misma de la API, httpOnly). Sin sesión vigente no hay conexión.
// - Para entrar a la sala de un siniestro se controla el acceso en la base, con el rol y el responsable vigentes,
//   igual que la ficha: el gestor, solo sus casos; la administración, todos.
// - Una conexión abierta puede quedar sin permiso (reasignación, baja del caso o del usuario, cambio de rol o de
//   contraseña, cierre de sesión). Se revisa al instante donde la API lo sabe (reasignación y logout), cada
//   REVISAR_CADA_MS para todo lo demás, y antes de cada envío a una sala (emitirASala): un contenido del caso
//   nunca le llega a quien ya no tiene acceso.
// - Sin CORS: el navegador llega por el mismo origen (Nginx en producción, el proxy de Vite en desarrollo).
//   allowRequest rechaza un handshake iniciado desde otro sitio.

const REVISAR_CADA_MS = 30_000
const PREFIJO_USUARIO = 'usuario:'
const PREFIJO_SINIESTRO = salaSiniestro(0).replace(/0$/, '')

type DatosSocket = {
  usuario: SesionUsuario
  token: string
  /** Salas con la conversación a la vista (sala:atencion) */
  atentas: Set<number>
}
export type SocketCova = Socket<EventosCliente, EventosServidor, Record<string, never>, DatosSocket>
export type BaseTiempoReal = Pick<Prisma.TransactionClient, 'usuario' | 'siniestro'>

export type DependenciasTiempoReal = {
  sesiones: Pick<ServicioSesiones, 'validar'>
  base: () => BaseTiempoReal
  revisarCadaMs?: number
}

/** Mismo origen: el host del Origin (si lo hay) tiene que ser el del pedido. Sin Origin (no es un navegador), pasa:
 *  igual necesita una cookie de sesión válida. Se comparan nombres sin puerto (Nginx manda Host sin él). */
export function origenPermitido(origen: string | undefined, host: string | undefined) {
  if (!origen) return true
  if (!host) return false
  try {
    return new URL(origen).hostname === new URL(`http://${host}`).hostname
  } catch {
    return false
  }
}

/** Valor de una cookie del encabezado Cookie del handshake (el mismo que lee cookie-parser en la API). */
export function leerCookie(encabezado: string | undefined, nombre: string) {
  for (const parte of (encabezado ?? '').split(';')) {
    const igual = parte.indexOf('=')
    if (igual < 0 || parte.slice(0, igual).trim() !== nombre) continue
    const valor = parte.slice(igual + 1).trim()
    try {
      return decodeURIComponent(valor) || undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

export function crearTiempoReal(servidor: ServidorHttp, deps: DependenciasTiempoReal) {
  const io = new Server<EventosCliente, EventosServidor, Record<string, never>, DatosSocket>(
    servidor,
    {
      path: RUTA_TIEMPO_REAL,
      serveClient: false,
      allowRequest: (req, aceptar) =>
        aceptar(null, origenPermitido(req.headers.origin, req.headers.host)),
    },
  )

  /** null si puede entrar; si no, el motivo con el código HTTP equivalente. */
  async function sinAcceso(idUsuario: number, idSiniestro: number) {
    const base = deps.base()
    const actor = await base.usuario.findFirst({
      where: { id: idUsuario, eliminado: false },
      select: { id: true, nombres: true, apellidos: true, email: true, tipoUsuario: true },
    })
    if (!actor) return { status: 401, error: 'Tu sesión venció. Volvé a ingresar.' }
    try {
      await exigirAccesoSiniestro(base, actor, idSiniestro)
      return null
    } catch (error) {
      if (error instanceof HttpError) return { status: error.status, error: error.message }
      throw error
    }
  }

  function salasDe(socket: SocketCova) {
    return [...socket.rooms]
      .filter((sala) => sala.startsWith(PREFIJO_SINIESTRO))
      .map((sala) => Number(sala.slice(PREFIJO_SINIESTRO.length)))
  }

  /** Revisa la sesión (sin renovarla) y el acceso a cada sala. Devuelve false si la conexión se cerró. */
  async function revisar(socket: SocketCova, soloSala?: number) {
    const valida = await deps.sesiones.validar(socket.data.token, { renovar: false })
    if (!valida) {
      socket.emit('sesion:vencida')
      socket.disconnect(true)
      return false
    }
    socket.data.usuario = valida.usuario
    for (const idSiniestro of salasDe(socket)) {
      if (soloSala !== undefined && idSiniestro !== soloSala) continue
      const motivo = await sinAcceso(valida.usuario.id, idSiniestro)
      if (motivo) {
        await socket.leave(salaSiniestro(idSiniestro))
        socket.data.atentas.delete(idSiniestro)
        socket.emit('sala:expulsado', { idSiniestro, motivo: motivo.error })
      }
    }
    return true
  }

  async function revisarVarios(sockets: SocketCova[], soloSala?: number) {
    await Promise.all(
      sockets.map((s) =>
        revisar(s, soloSala).catch((error: unknown) =>
          console.error('No se pudo revisar una conexión en tiempo real:', error),
        ),
      ),
    )
  }

  function socketsEn(sala: string) {
    const ids = io.sockets.adapter.rooms.get(sala) ?? new Set<string>()
    return [...ids].map((id) => io.sockets.sockets.get(id)).filter((s) => s !== undefined)
  }

  io.use(async (socket, next) => {
    try {
      const token = leerCookie(socket.handshake.headers.cookie, NOMBRE_COOKIE_SESION)
      const valida = token ? await deps.sesiones.validar(token, { renovar: false }) : null
      if (!token || !valida) {
        const error = new Error('Tu sesión venció. Volvé a ingresar.') as Error & {
          data?: unknown
        }
        error.data = { codigo: CODIGO_SESION_VENCIDA }
        return next(error)
      }
      socket.data = { usuario: valida.usuario, token, atentas: new Set() }
      next()
    } catch (error) {
      console.error('No se pudo validar la sesión del tiempo real:', error)
      next(new Error('No se pudo conectar. Se reintenta automáticamente.'))
    }
  })

  io.on('connection', (socket) => {
    void socket.join(`${PREFIJO_USUARIO}${socket.data.usuario.id}`)

    socket.on('sala:unirse', async (idCrudo, responder) => {
      const responderSeguro = typeof responder === 'function' ? responder : () => {}
      const id = idSchema.safeParse(idCrudo)
      if (!id.success)
        return responderSeguro({ ok: false, status: 400, error: 'Siniestro inválido.' })
      try {
        // La sesión pudo vencer o cerrarse mientras la conexión seguía abierta
        const valida = await deps.sesiones.validar(socket.data.token, { renovar: false })
        if (!valida) {
          responderSeguro({ ok: false, status: 401, error: 'Tu sesión venció. Volvé a ingresar.' })
          socket.emit('sesion:vencida')
          socket.disconnect(true)
          return
        }
        socket.data.usuario = valida.usuario
        const motivo = await sinAcceso(valida.usuario.id, id.data)
        if (motivo) return responderSeguro({ ok: false, ...motivo } satisfies RespuestaSala)
        // Estar en la sala no es mirar la conversación (la barra de pestañas también se une, por el número de no
        // leídos): el navegador avisa con sala:atencion cuando el chat está a la vista
        await socket.join(salaSiniestro(id.data))
        responderSeguro({ ok: true })
      } catch (error) {
        console.error('No se pudo unir a la sala del siniestro:', error)
        responderSeguro({
          ok: false,
          status: 503,
          error: 'No se pudo conectar con el chat. Se reintenta automáticamente.',
        })
      }
    })

    socket.on('sala:salir', (idCrudo) => {
      const id = idSchema.safeParse(idCrudo)
      if (!id.success) return
      socket.data.atentas.delete(id.data)
      void socket.leave(salaSiniestro(id.data))
    })

    socket.on('sala:atencion', (idCrudo, visible) => {
      const id = idSchema.safeParse(idCrudo)
      if (!id.success || !socket.rooms.has(salaSiniestro(id.data))) return
      if (visible === true) socket.data.atentas.add(id.data)
      else socket.data.atentas.delete(id.data)
    })
  })

  const revision = setInterval(
    () => void revisarVarios([...io.sockets.sockets.values()]),
    deps.revisarCadaMs ?? REVISAR_CADA_MS,
  )
  revision.unref()

  return {
    io,

    /** Usuarios conectados a la sala del siniestro. */
    conectados(idSiniestro: number): Set<number> {
      return new Set(socketsEn(salaSiniestro(idSiniestro)).map((s) => s.data.usuario.id))
    },

    /** Usuarios con la conversación a la vista: ya ven llegar los mensajes y no reciben el aviso en la bandeja. */
    presentes(idSiniestro: number): Set<number> {
      return new Set(
        socketsEn(salaSiniestro(idSiniestro))
          .filter((s) => s.data.atentas.has(idSiniestro))
          .map((s) => s.data.usuario.id),
      )
    },

    /**
     * Manda un evento a la sala, revisando antes a cada conectado: si perdió la sesión o el acceso, lo saca y no
     * recibe el contenido. Llamar después del commit.
     */
    async emitirASala<E extends keyof EventosServidor>(
      idSiniestro: number,
      evento: E,
      ...datos: Parameters<EventosServidor[E]>
    ) {
      const sala = salaSiniestro(idSiniestro)
      await revisarVarios(socketsEn(sala), idSiniestro)
      io.to(sala).emit(evento, ...datos)
    },

    /** Después de una reasignación o una baja del caso: el que perdió el acceso sale de la sala ya. */
    revisarSala(idSiniestro: number) {
      return revisarVarios(socketsEn(salaSiniestro(idSiniestro)), idSiniestro)
    },

    /** Después de un cambio de rol, una baja o un cambio de contraseña del usuario. */
    revisarUsuario(idUsuario: number) {
      return revisarVarios(socketsEn(`${PREFIJO_USUARIO}${idUsuario}`))
    },

    /** Logout: cierra ya las conexiones de esa sesión (las demás sesiones del usuario siguen). */
    cerrarSesion(token: string) {
      for (const socket of io.sockets.sockets.values())
        if (socket.data.token === token) {
          socket.emit('sesion:vencida')
          socket.disconnect(true)
        }
    },

    /**
     * Apagado del servidor: corta los transportes sin cerrar el HTTP. No usa disconnectSockets: un "el servidor te
     * desconectó" hace que el navegador NO reintente, y después de un deploy el chat quedaría muerto hasta recargar.
     */
    cerrar() {
      clearInterval(revision)
      for (const socket of io.sockets.sockets.values()) socket.conn.close()
    },
  }
}

export type TiempoReal = ReturnType<typeof crearTiempoReal>

// Las rutas de la API y los servicios se arman al importar, antes de que exista el servidor HTTP. Usan este acceso:
// mientras no se monte (pruebas de servicios, scripts) no hace nada.
let actual: TiempoReal | null = null

export const tiempoReal = {
  montar(instancia: TiempoReal | null) {
    actual = instancia
  },
  conectados(idSiniestro: number) {
    return actual?.conectados(idSiniestro) ?? new Set<number>()
  },
  presentes(idSiniestro: number) {
    return actual?.presentes(idSiniestro) ?? new Set<number>()
  },
  async emitirASala<E extends keyof EventosServidor>(
    idSiniestro: number,
    evento: E,
    ...datos: Parameters<EventosServidor[E]>
  ) {
    await actual?.emitirASala(idSiniestro, evento, ...datos)
  },
  async revisarSala(idSiniestro: number) {
    await actual?.revisarSala(idSiniestro)
  },
  async revisarUsuario(idUsuario: number) {
    await actual?.revisarUsuario(idUsuario)
  },
  cerrarSesion(token: string) {
    actual?.cerrarSesion(token)
  },
}
