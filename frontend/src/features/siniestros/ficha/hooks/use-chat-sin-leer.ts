import { useEffect, useRef, useState } from 'react'
import { escuchar, useSalaSiniestro } from '@/lib/tiempo-real'
import { obtenerChatSinLeer } from '../api/ficha.api'

/** Espera para juntar varios avisos seguidos (llegan mensajes y enseguida se marcan leídos) en un solo pedido */
const JUNTAR_MS = 300

/**
 * Cuántos mensajes del chat de otros no leyó el usuario: el número de la pestaña del chat (E7-03). Arranca con el
 * que trajo la ficha y se mantiene al día con la sala del siniestro: cuando llega un mensaje de otro, cuando el
 * usuario lee (en esta u otra pestaña del navegador) y al volver la conexión, pide la cantidad al servidor. Pedirla
 * en lugar de sumar y restar evita que el número se desfase si se pierde algún aviso.
 *
 * Con la pestaña del chat abierta, lo que llega se marca leído enseguida: no se suma, para que el número no salte a
 * 1 y vuelva a 0; se cuenta de nuevo cuando llega la lectura.
 */
export function useChatSinLeer(
  idSiniestro: number,
  idUsuario: number,
  inicial: number,
  enElChat: boolean,
) {
  const [cantidad, setCantidad] = useState(inicial)
  // La ficha se volvió a cargar: su número es el más reciente
  const [inicialAnterior, setInicialAnterior] = useState(inicial)
  if (inicialAnterior !== inicial) {
    setInicialAnterior(inicial)
    setCantidad(inicial)
  }

  const { sala } = useSalaSiniestro(idSiniestro)
  const unida = sala.tipo === 'unida'
  /** Cambia cada vez que hay que volver a contar */
  const [cambios, setCambios] = useState(0)
  const mirando = useRef(enElChat)
  useEffect(() => {
    mirando.current = enElChat
  }, [enElChat])

  useEffect(
    () =>
      escuchar('chat:mensaje', (mensaje) => {
        if (mensaje.idSiniestro !== idSiniestro || mensaje.autor.id === idUsuario) return
        if (mirando.current && document.visibilityState === 'visible') return
        // Se ve enseguida; el servidor confirma (o corrige, si ya se marcó leído) un momento después
        setCantidad((n) => n + 1)
        setCambios((n) => n + 1)
      }),
    [idSiniestro, idUsuario],
  )

  useEffect(
    () =>
      escuchar('chat:leido', (lecturas) => {
        if (lecturas.idSiniestro === idSiniestro && lecturas.lector.id === idUsuario)
          setCambios((n) => n + 1)
      }),
    [idSiniestro, idUsuario],
  )

  // Al unirse a la sala (al entrar y después de cada reconexión) y después de cada aviso
  useEffect(() => {
    if (!unida) return
    let vigente = true
    const espera = setTimeout(() => {
      obtenerChatSinLeer(idSiniestro)
        .then((r) => {
          if (vigente) setCantidad(r.sinLeer)
        })
        .catch(() => {
          // Queda el último número; se vuelve a pedir con el próximo aviso o al reconectar
        })
    }, JUNTAR_MS)
    return () => {
      vigente = false
      clearTimeout(espera)
    }
  }, [unida, cambios, idSiniestro])

  return cantidad
}
