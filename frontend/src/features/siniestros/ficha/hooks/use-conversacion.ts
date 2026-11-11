import { useCallback, useEffect, useRef, useState } from 'react'
import type { MensajeChat } from '@cova/shared/schemas/chat'
import { ApiError } from '@/lib/api'
import { escuchar, useSalaSiniestro } from '@/lib/tiempo-real'
import { enviarMensajeChat, obtenerChat } from '../api/ficha.api'
import { unirMensajes } from '../chat'

/** Un envío propio que todavía no confirmó el servidor */
export type MensajePendiente = {
  claveEnvio: string
  texto: string
  estado: 'enviando' | 'error'
  error?: string
}

/**
 * La conversación del chat (E7-02): lo que trajo la pestaña, más lo que llega en tiempo real, más los envíos propios
 * en curso. Cada vez que se (re)une a la sala pide lo posterior al último mensaje: lo que llegó mientras se abría la
 * pestaña o mientras la conexión estuvo cortada (CU-10 1.h.2).
 */
export function useConversacion(idSiniestro: number, inicial: MensajeChat[]) {
  const [mensajes, setMensajes] = useState(inicial)
  const [pendientes, setPendientes] = useState<MensajePendiente[]>([])
  /** Mensajes de otros que llegaron en tiempo real: los anuncia el lector de pantalla */
  const [ultimoAjeno, setUltimoAjeno] = useState<MensajeChat | null>(null)
  const { conexion, sala } = useSalaSiniestro(idSiniestro)
  const ultimoId = useRef(0)
  useEffect(() => {
    ultimoId.current = mensajes.reduce((max, m) => Math.max(max, m.id), 0)
  }, [mensajes])
  const clavesPropias = useRef(new Set<string>())

  const agregar = useCallback((nuevos: MensajeChat[]) => {
    setMensajes((actuales) => unirMensajes(actuales, nuevos))
    const confirmados = new Set(nuevos.map((m) => m.claveEnvio))
    setPendientes((p) => {
      const quedan = p.filter((x) => !confirmados.has(x.claveEnvio))
      return quedan.length === p.length ? p : quedan
    })
  }, [])

  useEffect(
    () =>
      escuchar('chat:mensaje', (mensaje) => {
        if (mensaje.idSiniestro !== idSiniestro) return
        agregar([mensaje])
        if (!mensaje.claveEnvio || !clavesPropias.current.has(mensaje.claveEnvio))
          setUltimoAjeno(mensaje)
      }),
    [idSiniestro, agregar],
  )

  // Al quedar unida a la sala (al entrar y después de cada reconexión): lo que se haya perdido
  const unida = sala.tipo === 'unida'
  useEffect(() => {
    if (!unida) return
    let vigente = true
    obtenerChat(idSiniestro, ultimoId.current || undefined)
      .then((c) => {
        if (vigente) agregar(c.mensajes)
      })
      .catch(() => {
        // Se vuelve a intentar con la próxima reconexión; lo ya mostrado sigue a la vista
      })
    return () => {
      vigente = false
    }
  }, [unida, idSiniestro, agregar])

  const enviar = useCallback(
    async (texto: string, claveEnvio: string) => {
      clavesPropias.current.add(claveEnvio)
      setPendientes((p) => [
        ...p.filter((x) => x.claveEnvio !== claveEnvio),
        { claveEnvio, texto, estado: 'enviando' },
      ])
      try {
        agregar([await enviarMensajeChat(idSiniestro, { texto, claveEnvio })])
      } catch (err) {
        setPendientes((p) =>
          p.map((x) =>
            x.claveEnvio === claveEnvio
              ? {
                  ...x,
                  estado: 'error',
                  error:
                    err instanceof ApiError
                      ? err.message
                      : 'No se pudo enviar el mensaje. Revisá tu conexión y reintentá.',
                }
              : x,
          ),
        )
        throw err
      }
    },
    [idSiniestro, agregar],
  )

  const descartar = useCallback((claveEnvio: string) => {
    setPendientes((p) => p.filter((x) => x.claveEnvio !== claveEnvio))
  }, [])

  return { mensajes, pendientes, ultimoAjeno, conexion, sala, enviar, descartar }
}
