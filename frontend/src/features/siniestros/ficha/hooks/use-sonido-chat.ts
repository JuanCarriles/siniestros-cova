import { useEffect, useRef } from 'react'
import { escuchar } from '@/lib/tiempo-real'
import { sonarMensaje } from '@/lib/sonido-mensajes'

/**
 * Suena cuando llega un mensaje de otro participante al chat del siniestro, en cualquier pestaña de la ficha (la
 * barra de pestañas mantiene la sala abierta). Con el chat abierto y a la vista suena más suave: el mensaje ya se
 * ve llegar. Los propios (también los enviados desde otra pestaña del navegador) no suenan.
 */
export function useSonidoChat(idSiniestro: number, idUsuario: number, enElChat: boolean) {
  const mirando = useRef(enElChat)
  useEffect(() => {
    mirando.current = enElChat
  }, [enElChat])

  useEffect(
    () =>
      escuchar('chat:mensaje', (mensaje) => {
        if (mensaje.idSiniestro !== idSiniestro || mensaje.autor.id === idUsuario) return
        sonarMensaje({ suave: mirando.current && document.visibilityState === 'visible' })
      }),
    [idSiniestro, idUsuario],
  )
}
