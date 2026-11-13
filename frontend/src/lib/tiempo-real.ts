import { useEffect, useSyncExternalStore } from 'react'
import { io, type Socket } from 'socket.io-client'
import {
  CODIGO_SESION_VENCIDA,
  RUTA_TIEMPO_REAL,
  type EventosCliente,
  type EventosServidor,
  type RespuestaSala,
} from '@cova/shared/schemas/tiempo-real'
import { rutaLoginSesionVencida } from './api'

// Conexión en tiempo real (E7-01). Una sola por pestaña del navegador, compartida por todas las pantallas que la
// necesiten, al mismo origen que la API: la cookie de sesión viaja sola y nunca se lee desde JavaScript.
//
// Se conecta con el primer oyente o sala. La campana mantiene la conexión personal sin abrir chats.
// Se corta un rato después de salir de la última sala y retirar el último oyente. Si se cae (red, reinicio del
// servidor), Socket.IO reintenta solo, con espera creciente; al volver, se reincorpora a las salas abiertas y cada
// pantalla recupera lo que se perdió (ver onReconectado).

export type EstadoConexion =
  /** Sin salas ni oyentes montados: no hace falta conexión */
  | 'inactiva'
  | 'conectando'
  | 'conectada'
  /** Se perdió y se está reintentando */
  | 'reconectando'

export type EstadoSala =
  | { tipo: 'uniendo' }
  | { tipo: 'unida' }
  /** No puede entrar (403, 404) o el servidor lo sacó porque perdió el acceso */
  | { tipo: 'sin-acceso'; motivo: string }

type SocketCova = Socket<EventosServidor, EventosCliente>
type Sala = {
  abiertas: number
  /** Cuántas pantallas muestran la conversación (la barra de pestañas está en la sala, pero no la muestra) */
  mirando: number
  estado: EstadoSala
}

const CORTAR_SIN_SALAS_MS = 10_000

let socket: SocketCova | null = null
let estado: EstadoConexion = 'inactiva'
let conectoAlgunaVez = false
let corte: ReturnType<typeof setTimeout> | undefined
let oyentesActivos = 0
const oyentesEstado = new Set<() => void>()
const salas = new Map<number, Sala>()
const oyentesSala = new Map<number, Set<() => void>>()
const UNIENDO: EstadoSala = { tipo: 'uniendo' }
const alReconectar = new Set<() => void>()
const alConectar = new Set<() => void>()
const enUso = () => salas.size > 0 || oyentesActivos > 0
function programarCorte() {
  clearTimeout(corte)
  if (enUso()) return
  corte = setTimeout(() => {
    if (!enUso()) socket?.disconnect()
  }, CORTAR_SIN_SALAS_MS)
}

function cambiarEstado(nuevo: EstadoConexion) {
  if (nuevo === estado) return
  estado = nuevo
  oyentesEstado.forEach((o) => o())
}

function cambiarSala(id: number, nuevo: EstadoSala) {
  const sala = salas.get(id)
  if (!sala) return
  sala.estado = nuevo
  oyentesSala.get(id)?.forEach((o) => o())
}

function sesionVencida() {
  cerrarTiempoReal()
  window.location.assign(rutaLoginSesionVencida())
}

/** La pestaña del navegador está a la vista (no minimizada ni detrás de otra pestaña) */
const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible'

/** E7-02: la conversación está a la vista. Quien la mira no recibe el aviso en la bandeja: ya ve llegar los mensajes. */
function informarAtencion(id: number) {
  const sala = salas.get(id)
  if (!socket?.connected || sala?.estado.tipo !== 'unida') return
  socket.emit('sala:atencion', id, sala.mirando > 0 && visible())
}

function unirse(id: number) {
  if (!socket?.connected) return
  cambiarSala(id, { tipo: 'uniendo' })
  socket
    .timeout(15_000)
    .emit('sala:unirse', id, (error: Error | null, respuesta?: RespuestaSala) => {
      if (!salas.has(id)) return
      // Sin respuesta a tiempo: se reintenta con la próxima reconexión
      if (error || !respuesta) return
      if (respuesta.ok) {
        cambiarSala(id, { tipo: 'unida' })
        // El servidor asume que no la está mirando: si la conversación está a la vista, que lo sepa
        if (salas.get(id)?.mirando) informarAtencion(id)
      } else if (respuesta.status === 401) sesionVencida()
      else if (respuesta.status === 503) return
      else cambiarSala(id, { tipo: 'sin-acceso', motivo: respuesta.error })
    })
}

function conectar(): SocketCova {
  if (socket) {
    if (!socket.active) socket.connect()
    return socket
  }
  const nuevo: SocketCova = io({ path: RUTA_TIEMPO_REAL, withCredentials: true })
  socket = nuevo
  cambiarEstado('conectando')
  nuevo.on('connect', () => {
    const reconexion = conectoAlgunaVez
    conectoAlgunaVez = true
    cambiarEstado('conectada')
    for (const id of salas.keys()) unirse(id)
    alConectar.forEach((o) => o())
    if (reconexion) alReconectar.forEach((o) => o())
  })
  nuevo.on('disconnect', () => {
    // Un corte pedido por el navegador (salir de la última sala, logout) no es una pérdida de conexión
    cambiarEstado(nuevo.active ? 'reconectando' : 'inactiva')
  })
  nuevo.on('connect_error', (error) => {
    const datos = (error as Error & { data?: { codigo?: string } }).data
    if (datos?.codigo === CODIGO_SESION_VENCIDA) return sesionVencida()
    cambiarEstado(conectoAlgunaVez ? 'reconectando' : 'conectando')
  })
  nuevo.on('sesion:vencida', sesionVencida)
  nuevo.on('sala:expulsado', ({ idSiniestro, motivo }) =>
    cambiarSala(idSiniestro, { tipo: 'sin-acceso', motivo }),
  )
  return nuevo
}

// La red del equipo se cortó: avisar ya, sin esperar los ~45 s que tarda en notarlo el latido de Socket.IO.
// Al volver, reintentar de inmediato.
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => {
    if (enUso() && estado !== 'inactiva') cambiarEstado('reconectando')
  })
  // E7-02: quien tiene el chat abierto pero en una pestaña oculta no lo está mirando: tiene que recibir el aviso
  document.addEventListener('visibilitychange', () => {
    if (!socket?.connected) return
    for (const [id, sala] of salas) if (sala.mirando) informarAtencion(id)
  })
  window.addEventListener('online', () => {
    if (enUso() && socket && !socket.connected) {
      socket.disconnect()
      socket.connect()
    }
  })
}

/**
 * Entra a la sala del siniestro. Devuelve la función para salir (las pantallas la llaman al desmontarse).
 * `mirando`: la pantalla muestra la conversación (el chat), no solo escucha lo que pasa en ella (la barra de
 * pestañas, para el número de no leídos).
 */
export function abrirSala(id: number, { mirando = false }: { mirando?: boolean } = {}): () => void {
  clearTimeout(corte)
  let sala = salas.get(id)
  if (!sala) {
    sala = { abiertas: 0, mirando: 0, estado: UNIENDO }
    salas.set(id, sala)
  }
  sala.abiertas++
  if (mirando && ++sala.mirando === 1) informarAtencion(id)
  const s = conectar()
  if (sala.abiertas === 1 && s.connected) unirse(id)
  return () => {
    const actual = salas.get(id)
    if (!actual) return
    actual.abiertas--
    if (mirando && --actual.mirando === 0) informarAtencion(id)
    if (actual.abiertas > 0) return
    salas.delete(id)
    socket?.emit('sala:salir', id)
    programarCorte()
  }
}

/** Escucha un evento del servidor mientras la pantalla está montada. */
export function escuchar<E extends keyof EventosServidor>(
  evento: E,
  oyente: EventosServidor[E],
): () => void {
  clearTimeout(corte)
  oyentesActivos++
  const s = conectar()
  let activo = true
  // Los tipos de Socket.IO no aceptan un genérico acá; el contrato lo garantiza EventosServidor.
  s.on(evento, oyente as never)
  return () => {
    if (!activo) return
    activo = false
    s.off(evento, oyente as never)
    if (socket === s) {
      oyentesActivos--
      programarCorte()
    }
  }
}

/** Incluye la primera conexión: recupera avisos entre la consulta inicial y el handshake. */
export function onConectado(oyente: () => void): () => void {
  alConectar.add(oyente)
  if (socket?.connected) oyente()
  return () => {
    alConectar.delete(oyente)
  }
}

/** Se llama al volver la conexión después de un corte: momento de pedir lo que llegó mientras tanto. */
export function onReconectado(oyente: () => void): () => void {
  alReconectar.add(oyente)
  return () => {
    alReconectar.delete(oyente)
  }
}

/** Logout: cortar antes de cerrar la sesión, para no tomar el cierre propio como una sesión vencida. */
export function cerrarTiempoReal() {
  clearTimeout(corte)
  salas.clear()
  oyentesActivos = 0
  socket?.removeAllListeners()
  socket?.disconnect()
  socket = null
  conectoAlgunaVez = false
  cambiarEstado('inactiva')
}

export function useEstadoConexion(): EstadoConexion {
  return useSyncExternalStore(
    (o) => {
      oyentesEstado.add(o)
      return () => {
        oyentesEstado.delete(o)
      }
    },
    () => estado,
    () => 'inactiva',
  )
}

/** Abre la sala mientras el componente está montado y devuelve el estado de la conexión y de la sala. */
export function useSalaSiniestro(
  idSiniestro: number,
  { mirando = false }: { mirando?: boolean } = {},
) {
  useEffect(() => abrirSala(idSiniestro, { mirando }), [idSiniestro, mirando])
  const sala = useSyncExternalStore(
    (o) => {
      const oyentes = oyentesSala.get(idSiniestro) ?? new Set()
      oyentesSala.set(idSiniestro, oyentes)
      oyentes.add(o)
      return () => {
        oyentes.delete(o)
        if (!oyentes.size) oyentesSala.delete(idSiniestro)
      }
    },
    () => salas.get(idSiniestro)?.estado ?? UNIENDO,
    () => UNIENDO,
  )
  return { conexion: useEstadoConexion(), sala }
}
