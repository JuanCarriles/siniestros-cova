import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { MensajeChat } from '@cova/shared/schemas/chat'
import { ApiError } from '@/lib/api'
import { escuchar, onReconectado, useSalaSiniestro } from '@/lib/tiempo-real'
import { actualizarNotificaciones } from '@/features/notificaciones/actualizar-notificaciones'
import { enviarMensajeChat, marcarChatLeido, obtenerChat } from '../api/ficha.api'
import { aplicarLecturas, esFallaDeConexion, idsPorLeer, unirMensajes } from '../chat'
import { crearMarcadoLeido } from '../marcado-leido'

/** Un envío propio que todavía no confirmó el servidor */
export type MensajePendiente = {
  claveEnvio: string
  texto: string
  estado: 'enviando' | 'error'
  error?: string
  /** El último mensaje de la conversación cuando se escribió: se muestra justo después (lineaDeTiempo) */
  despuesDe: number | null
  /** Falló por la conexión (o el servidor): se reenvía solo cuando vuelve. Un rechazo no. */
  reintentable: boolean
}

/** La pestaña del navegador está a la vista */
function useVisible() {
  return useSyncExternalStore(
    (o) => {
      document.addEventListener('visibilitychange', o)
      return () => document.removeEventListener('visibilitychange', o)
    },
    () => document.visibilityState === 'visible',
    () => true,
  )
}

/**
 * La conversación del chat (E7-02): lo que trajo la pestaña, más lo que llega en tiempo real, más los envíos propios
 * en curso. Cada vez que se (re)une a la sala pide lo posterior al último mensaje: lo que llegó mientras se abría la
 * pestaña o mientras la conexión estuvo cortada (CU-10 1.h.2). Recarga la conversación entera, no solo lo nuevo:
 * también pudieron leerse mensajes viejos mientras tanto (E7-03).
 *
 * E7-03: al entrar, y cada vez que llega algo de otro mientras se mira la conversación (pestaña visible), marca lo
 * pendiente como leído; el servidor retira el aviso de la bandeja e informa la lectura a los demás. Cuándo pedirlo
 * (un pedido por vez, otra pasada si llegó algo mientras tanto, reintentos) lo decide crearMarcadoLeido.
 *
 * Un envío que falla por la conexión queda en su lugar de la conversación (no al final) y se reenvía solo cuando
 * vuelve la conexión, con la misma clave: el servidor no lo guarda dos veces. También se puede reintentar a mano.
 */
export function useConversacion(idSiniestro: number, idUsuario: number, inicial: MensajeChat[]) {
  const [mensajes, setMensajes] = useState(inicial)
  const [pendientes, setPendientes] = useState<MensajePendiente[]>([])
  /** Mensajes de otros que llegaron en tiempo real: los anuncia el lector de pantalla */
  const [ultimoAjeno, setUltimoAjeno] = useState<MensajeChat | null>(null)
  const { conexion, sala } = useSalaSiniestro(idSiniestro, { mirando: true })
  const clavesPropias = useRef(new Set<string>())
  // Para leer el estado actual desde los avisos de reconexión y al crear un envío, sin volver a suscribirse
  const ultimoId = useRef<number | null>(inicial.at(-1)?.id ?? null)
  const pendientesActuales = useRef<MensajePendiente[]>([])
  useEffect(() => {
    ultimoId.current = mensajes.at(-1)?.id ?? null
    pendientesActuales.current = pendientes
  }, [mensajes, pendientes])

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

  useEffect(
    () =>
      escuchar('chat:leido', (lecturas) => {
        if (lecturas.idSiniestro === idSiniestro)
          setMensajes((actuales) => aplicarLecturas(actuales, lecturas))
      }),
    [idSiniestro],
  )

  // Al quedar unida a la sala (al entrar y después de cada reconexión): lo que se haya perdido
  const unida = sala.tipo === 'unida'
  useEffect(() => {
    if (!unida) return
    let vigente = true
    obtenerChat(idSiniestro)
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

  // E7-03: marcar como leído al entrar (aunque no haya nada pendiente: retira un aviso que haya quedado) y cada vez
  // que cambia lo que hay sin leer mientras se mira la conversación
  const visible = useVisible()
  const porLeer = idsPorLeer(mensajes, idUsuario)
  const marcado = useRef<ReturnType<typeof crearMarcadoLeido> | null>(null)
  useEffect(() => {
    const nuevo = crearMarcadoLeido({
      marcar: () => marcarChatLeido(idSiniestro),
      alMarcar: (r) => {
        setMensajes((actuales) => aplicarLecturas(actuales, r.lecturas))
        if (r.avisosRetirados) actualizarNotificaciones()
      },
    })
    marcado.current = nuevo
    return () => {
      nuevo.cerrar()
      marcado.current = null
    }
  }, [idSiniestro])
  useEffect(() => {
    marcado.current?.actualizar({ activo: unida && visible, porLeer })
  }, [unida, visible, porLeer, idSiniestro])

  const enviar = useCallback(
    async (texto: string, claveEnvio: string) => {
      clavesPropias.current.add(claveEnvio)
      const despuesDe = ultimoId.current
      // Un reintento conserva el lugar del mensaje en la conversación; uno nuevo va después del último
      setPendientes((p) =>
        p.some((x) => x.claveEnvio === claveEnvio)
          ? p.map((x) =>
              x.claveEnvio === claveEnvio ? { ...x, estado: 'enviando', error: undefined } : x,
            )
          : [...p, { claveEnvio, texto, estado: 'enviando', despuesDe, reintentable: false }],
      )
      try {
        agregar([await enviarMensajeChat(idSiniestro, { texto, claveEnvio })])
      } catch (err) {
        const status = err instanceof ApiError ? err.status : undefined
        const reintentable = esFallaDeConexion(status)
        setPendientes((p) =>
          p.map((x) =>
            x.claveEnvio === claveEnvio
              ? {
                  ...x,
                  estado: 'error',
                  reintentable,
                  error: reintentable
                    ? 'Sin conexión. Se va a reenviar solo cuando vuelva la conexión.'
                    : err instanceof ApiError
                      ? err.message
                      : 'No se pudo enviar el mensaje.',
                }
              : x,
          ),
        )
        throw err
      }
    },
    [idSiniestro, agregar],
  )

  // Al volver la conexión, se reenvían solos los que fallaron por la conexión (en el orden en que se escribieron)
  useEffect(
    () =>
      onReconectado(() => {
        const fallidos = pendientesActuales.current.filter(
          (p) => p.estado === 'error' && p.reintentable,
        )
        // De a uno: el servidor los guarda en el mismo orden en que se escribieron. Si uno vuelve a fallar, los
        // demás esperan a la próxima reconexión.
        void (async () => {
          for (const p of fallidos) await enviar(p.texto, p.claveEnvio)
        })().catch(() => {})
      }),
    [enviar],
  )

  const descartar = useCallback((claveEnvio: string) => {
    setPendientes((p) => p.filter((x) => x.claveEnvio !== claveEnvio))
  }, [])

  return { mensajes, pendientes, ultimoAjeno, conexion, sala, enviar, descartar }
}
