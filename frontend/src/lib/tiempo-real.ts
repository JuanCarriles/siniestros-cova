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
// Se conecta con la primera sala y se corta un rato después de salir de la última. Si se cae (red, reinicio del
// servidor), Socket.IO reintenta solo, con espera creciente; al volver, se reincorpora a las salas abiertas y cada
// pantalla recupera lo que se perdió (ver onReconectado).

export type EstadoConexion =
  /** Sin salas abiertas: no hace falta conexión */
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
type Sala = { abiertas: number; estado: EstadoSala }

const CORTAR_SIN_SALAS_MS = 10_000

let socket: SocketCova | null = null
let estado: EstadoConexion = 'inactiva'
let conectoAlgunaVez = false
let corte: ReturnType<typeof setTimeout> | undefined
const oyentesEstado = new Set<() => void>()
const salas = new Map<number, Sala>()
const oyentesSala = new Map<number, Set<() => void>>()
const UNIENDO: EstadoSala = { tipo: 'uniendo' }
const alReconectar = new Set<() => void>()

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

function unirse(id: number) {
  if (!socket?.connected) return
  cambiarSala(id, { tipo: 'uniendo' })
  socket
    .timeout(15_000)
    .emit('sala:unirse', id, (error: Error | null, respuesta?: RespuestaSala) => {
      if (!salas.has(id)) return
      // Sin respuesta a tiempo: se reintenta con la próxima reconexión
      if (error || !respuesta) return
      if (respuesta.ok) cambiarSala(id, { tipo: 'unida' })
      else if (respuesta.status === 401) sesionVencida()
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
    if (salas.size && estado !== 'inactiva') cambiarEstado('reconectando')
  })
  window.addEventListener('online', () => {
    if (salas.size && socket && !socket.connected) {
      socket.disconnect()
      socket.connect()
    }
  })
}

/** Entra a la sala del siniestro. Devuelve la función para salir (las pantallas la llaman al desmontarse). */
export function abrirSala(id: number): () => void {
  clearTimeout(corte)
  let sala = salas.get(id)
  if (!sala) {
    sala = { abiertas: 0, estado: UNIENDO }
    salas.set(id, sala)
  }
  sala.abiertas++
  const s = conectar()
  if (sala.abiertas === 1 && s.connected) unirse(id)
  return () => {
    const actual = salas.get(id)
    if (!actual) return
    actual.abiertas--
    if (actual.abiertas > 0) return
    salas.delete(id)
    socket?.emit('sala:salir', id)
    if (salas.size === 0) {
      clearTimeout(corte)
      corte = setTimeout(() => {
        if (salas.size === 0) socket?.disconnect()
      }, CORTAR_SIN_SALAS_MS)
    }
  }
}

/** Escucha un evento del servidor mientras la pantalla está montada. */
export function escuchar<E extends keyof EventosServidor>(
  evento: E,
  oyente: EventosServidor[E],
): () => void {
  const s = conectar()
  // Los tipos de Socket.IO no aceptan un genérico acá; el contrato lo garantiza EventosServidor.
  s.on(evento, oyente as never)
  return () => {
    s.off(evento, oyente as never)
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
export function useSalaSiniestro(idSiniestro: number) {
  useEffect(() => abrirSala(idSiniestro), [idSiniestro])
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
