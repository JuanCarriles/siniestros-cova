import { useSyncExternalStore } from 'react'

// Sonido de mensaje nuevo del chat. Se genera con Web Audio (dos notas cortas, ascendentes): no hay archivo de
// audio que descargar ni sonido de terceros. Se puede silenciar; la preferencia se recuerda en este navegador.
//
// Los navegadores no dejan sonar nada hasta que la persona interactúa con la página: el contexto de audio se crea (o
// se reanuda) con el primer clic o tecla. Antes de eso, sonarMensaje() no hace nada y no da error.

const CLAVE = 'cova:sonido-chat'
/** Varios mensajes seguidos suenan una sola vez */
export const SONAR_CADA_MS = 1_500

let activado = leerPreferencia()
const oyentes = new Set<() => void>()
let contexto: AudioContext | null = null
let ultimo = Number.NEGATIVE_INFINITY

function leerPreferencia() {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem(CLAVE) !== 'no'
  } catch {
    return true
  }
}

/** Si corresponde sonar: activado y sin otro sonido hace menos de SONAR_CADA_MS */
export function debeSonar(ultimoMs: number, ahoraMs: number, encendido: boolean) {
  return encendido && ahoraMs - ultimoMs >= SONAR_CADA_MS
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  contexto ??= new AudioContext()
  if (contexto.state === 'suspended') void contexto.resume().catch(() => {})
  return contexto
}

// Desbloquear el audio con la primera interacción de la persona
if (typeof window !== 'undefined') {
  const desbloquear = () => {
    audio()
    window.removeEventListener('pointerdown', desbloquear)
    window.removeEventListener('keydown', desbloquear)
  }
  window.addEventListener('pointerdown', desbloquear)
  window.addEventListener('keydown', desbloquear)
}

function nota(ctx: AudioContext, frecuencia: number, inicio: number, volumen: number) {
  const osc = ctx.createOscillator()
  const ganancia = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(frecuencia, inicio)
  // Ataque rápido y caída suave: un "pop" corto, sin clic al empezar ni al terminar
  ganancia.gain.setValueAtTime(0.0001, inicio)
  ganancia.gain.exponentialRampToValueAtTime(volumen, inicio + 0.015)
  ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.16)
  osc.connect(ganancia).connect(ctx.destination)
  osc.start(inicio)
  osc.stop(inicio + 0.18)
}

/**
 * Suena el aviso de mensaje nuevo. `suave`: con la conversación a la vista (el mensaje ya se ve llegar).
 * `forzar`: para la prueba del botón (suena aunque haya sonado hace poco).
 */
export function sonarMensaje({ suave = false, forzar = false } = {}) {
  const ahora = Date.now()
  if (!forzar && !debeSonar(ultimo, ahora, activado)) return
  const ctx = audio()
  if (!ctx) return
  ultimo = ahora
  const volumen = suave ? 0.06 : 0.18
  const tocar = () => {
    const t = ctx.currentTime + 0.01
    nota(ctx, 880, t, volumen)
    nota(ctx, 1320, t + 0.11, volumen)
  }
  if (ctx.state === 'running') return tocar()
  // Recién desbloqueado (o todavía no): si el navegador lo permite, suena al reanudarse; si no, no hace nada
  ctx
    .resume()
    .then(() => {
      if (ctx.state === 'running') tocar()
    })
    .catch(() => {})
}

export function sonidoActivado() {
  return activado
}

export function cambiarSonido(valor: boolean) {
  activado = valor
  try {
    localStorage.setItem(CLAVE, valor ? 'si' : 'no')
  } catch {
    // Sin almacenamiento (ventana privada): vale para esta visita
  }
  oyentes.forEach((o) => o())
}

export function useSonidoActivado() {
  return useSyncExternalStore(
    (o) => {
      oyentes.add(o)
      return () => {
        oyentes.delete(o)
      }
    },
    () => activado,
    () => true,
  )
}
