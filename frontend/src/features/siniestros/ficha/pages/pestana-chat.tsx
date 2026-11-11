import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDown, MessagesSquare, RotateCcw, Send, X } from 'lucide-react'
import {
  MAXIMO_MENSAJE_CHAT,
  enviarMensajeChatSchema,
  type EnviarMensajeChatData,
  type EnviarMensajeChatInput,
  type MensajeChat,
} from '@cova/shared/schemas/chat'
import { Aviso } from '@/components/aviso'
import { usePanel } from '@/components/layout/panel-context'
import { roleLabels } from '@/components/layout/panel-navigation'
import { TextareaField } from '@/components/textarea-field'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EstadoConexionChat } from '../components/estado-conexion-chat'
import { PestanaFicha, PestanaVacia } from '../components/pestana-ficha'
import { useConversacion, type MensajePendiente } from '../hooks/use-conversacion'
import { useFicha, usePestana } from '../hooks/use-ficha'

/** A partir de cuántos caracteres restantes el contador se avisa al lector de pantalla */
const AVISAR_DESDE = 200
/** Si se está leyendo a menos de esto del final, un mensaje nuevo baja la vista solo */
const CERCA_DEL_FINAL_PX = 120

const hora = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const diaLargo = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const claveDia = (iso: string) => new Date(iso).toDateString()

/** "Hoy", "Ayer" o "lunes, 9 de noviembre de 2026" */
function etiquetaDia(iso: string) {
  const fecha = new Date(iso)
  const hoy = new Date()
  const ayer = new Date(hoy)
  ayer.setDate(hoy.getDate() - 1)
  if (fecha.toDateString() === hoy.toDateString()) return 'Hoy'
  if (fecha.toDateString() === ayer.toDateString()) return 'Ayer'
  const texto = diaLargo.format(fecha)
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

// Pestaña "Chat" (CU-10 1.h, E7-01 y E7-02): la conversación del siniestro entre el gestor asignado y la
// administración, del mensaje más viejo (arriba) al más nuevo (abajo, junto al cuadro para escribir). Cada mensaje
// muestra su autor, su rol y su fecha y hora; los propios van a la derecha, con fondo y borde distintos y la
// palabra "Vos". Llegan en tiempo real; si se corta la conexión se avisa y, al volver, se cargan los que faltaban.
// Los mensajes no se editan ni se borran. Un siniestro cerrado o dado de baja solo se lee.
export function PestanaChat() {
  const { usuario } = usePanel()
  const ficha = useFicha()
  const inicial = usePestana<'chat'>()
  const { mensajes, pendientes, ultimoAjeno, conexion, sala, enviar, descartar } = useConversacion(
    ficha.id,
    inicial.mensajes,
  )
  const soloLectura = inicial.soloLectura

  // --- Desplazamiento: arranca abajo; un mensaje nuevo baja la vista si se estaba leyendo el final o si es propio
  const lista = useRef<HTMLDivElement>(null)
  const cercaDelFinal = useRef(true)
  const [sinVer, setSinVer] = useState(0)
  const cantidad = mensajes.length + pendientes.length
  const anterior = useRef(cantidad)
  const ultimo = mensajes.at(-1)
  const ultimoEsPropio = pendientes.length > 0 || ultimo?.autor.id === usuario.id

  const irAlFinal = (suave = false) => {
    const el = lista.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: suave ? 'smooth' : 'auto' })
    setSinVer(0)
  }
  useLayoutEffect(() => {
    const nuevos = cantidad - anterior.current
    anterior.current = cantidad
    if (nuevos < 0) return
    if (nuevos === 0 || cercaDelFinal.current || ultimoEsPropio) irAlFinal()
    else setSinVer((n) => n + nuevos)
    // irAlFinal solo usa refs y el setter
     
  }, [cantidad, ultimoEsPropio])

  return (
    <PestanaFicha titulo={usuario.tipo === 'GESTOR' ? 'Chat' : 'Chat con el gestor'}>
      <div className="grid gap-4">
        <EstadoConexionChat conexion={conexion} sala={sala} />

        {/* Lo que llega de otros, para el lector de pantalla (los propios ya se confirman en su mensaje) */}
        <p className="sr-only" role="status" aria-live="polite">
          {ultimoAjeno &&
            `Mensaje nuevo de ${ultimoAjeno.autor.nombre}: ${ultimoAjeno.texto.slice(0, 200)}`}
        </p>

        <div className="relative">
          <div
            ref={lista}
            tabIndex={0}
            role="region"
            aria-label="Conversación, del mensaje más viejo al más nuevo"
            onScroll={(e) => {
              const el = e.currentTarget
              cercaDelFinal.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < CERCA_DEL_FINAL_PX
              if (cercaDelFinal.current) setSinVer(0)
            }}
            className="max-h-[60dvh] min-h-48 overflow-y-auto overscroll-contain rounded-lg border-2 border-line bg-surface-subtle px-3 py-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-5"
          >
            {mensajes.length === 0 && pendientes.length === 0 ? (
              <PestanaVacia icono={MessagesSquare}>
                {soloLectura
                  ? 'En este siniestro no hubo conversación.'
                  : 'Todavía no hay mensajes. Escribí abajo para empezar la conversación con ' +
                    (usuario.tipo === 'GESTOR' ? 'la administración.' : 'el gestor asignado.')}
              </PestanaVacia>
            ) : (
              <ol className="grid gap-3">
                {mensajes.map((m, i) => (
                  <li key={m.id} className="grid gap-3">
                    {(i === 0 ||
                      claveDia(mensajes[i - 1].fechaEnvio) !== claveDia(m.fechaEnvio)) && (
                      <SeparadorDia iso={m.fechaEnvio} />
                    )}
                    <Mensaje mensaje={m} propio={m.autor.id === usuario.id} />
                  </li>
                ))}
                {pendientes.map((p) => (
                  <li key={p.claveEnvio}>
                    <Pendiente
                      pendiente={p}
                      onReintentar={() => void enviar(p.texto, p.claveEnvio).catch(() => {})}
                      onDescartar={() => descartar(p.claveEnvio)}
                    />
                  </li>
                ))}
              </ol>
            )}
          </div>
          {sinVer > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={() => irAlFinal(true)}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-card"
            >
              <ArrowDown aria-hidden="true" />
              {sinVer === 1 ? '1 mensaje nuevo' : `${sinVer} mensajes nuevos`}
            </Button>
          )}
        </div>

        {soloLectura ? (
          <Aviso tipo="info">{soloLectura}</Aviso>
        ) : (
          sala.tipo !== 'sin-acceso' && <Redactar onEnviar={enviar} />
        )}
      </div>
    </PestanaFicha>
  )
}

function SeparadorDia({ iso }: { iso: string }) {
  return (
    <p className="flex items-center gap-3 pt-2 text-sm font-bold text-ink-2" role="separator">
      <span className="h-0.5 flex-1 bg-line" aria-hidden="true" />
      <span className="rounded-full border-2 border-line bg-card px-3 py-0.5">
        <time dateTime={iso.slice(0, 10)}>{etiquetaDia(iso)}</time>
      </span>
      <span className="h-0.5 flex-1 bg-line" aria-hidden="true" />
    </p>
  )
}

function Mensaje({ mensaje: m, propio }: { mensaje: MensajeChat; propio: boolean }) {
  return (
    <article
      aria-label={`${propio ? 'Tu mensaje' : `Mensaje de ${m.autor.nombre}`}, ${etiquetaDia(m.fechaEnvio).toLowerCase()} a las ${hora.format(new Date(m.fechaEnvio))}`}
      className={cn(
        'grid max-w-[min(100%,46rem)] gap-1.5 rounded-lg border-2 px-4 py-3',
        propio
          ? 'ml-auto border-r-8 border-owner-border border-r-brand-accent bg-owner-bg'
          : 'mr-auto border-l-8 border-line border-l-ink-2 bg-card',
      )}
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <strong className="text-base">{propio ? 'Vos' : m.autor.nombre}</strong>
        <span className="rounded bg-neutral-bg px-1.5 text-sm font-semibold text-neutral-ink">
          {m.autor.tipoUsuario ? roleLabels[m.autor.tipoUsuario] : 'Rol no registrado'}
        </span>
        <time dateTime={m.fechaEnvio} className="ml-auto dato text-sm text-muted-foreground">
          {hora.format(new Date(m.fechaEnvio))}
        </time>
      </p>
      <p className="text-lg leading-relaxed break-words whitespace-pre-wrap">{m.texto}</p>
    </article>
  )
}

function Pendiente({
  pendiente: p,
  onReintentar,
  onDescartar,
}: {
  pendiente: MensajePendiente
  onReintentar: () => void
  onDescartar: () => void
}) {
  const error = p.estado === 'error'
  return (
    <article
      aria-label={error ? 'Tu mensaje no se envió' : 'Tu mensaje, enviándose'}
      className={cn(
        'ml-auto grid max-w-[min(100%,46rem)] gap-2 rounded-lg border-2 border-dashed px-4 py-3',
        error ? 'border-destructive bg-danger-bg' : 'border-owner-border bg-owner-bg',
      )}
    >
      <p className="text-lg leading-relaxed break-words whitespace-pre-wrap">{p.texto}</p>
      {error ? (
        <div className="grid gap-2">
          <p role="alert" className="font-semibold text-danger-ink">
            No se envió. {p.error}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onDescartar}>
              <X aria-hidden="true" />
              Descartar
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onReintentar}>
              <RotateCcw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm font-semibold text-muted-foreground">Enviando…</p>
      )}
    </article>
  )
}

function Redactar({
  onEnviar,
}: {
  onEnviar: (texto: string, claveEnvio: string) => Promise<void>
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<EnviarMensajeChatInput, unknown, EnviarMensajeChatData>({
    resolver: zodResolver(enviarMensajeChatSchema),
    // Una clave por mensaje: si el envío falla y se reintenta, va la misma y el servidor no lo guarda dos veces
    defaultValues: { texto: '', claveEnvio: crypto.randomUUID() },
  })
  const quedan = MAXIMO_MENSAJE_CHAT - (useWatch({ control, name: 'texto' }) ?? '').length

  // El mensaje pasa a la conversación como "Enviando…" y el cuadro queda libre para el siguiente
  const enviar = handleSubmit((datos) => {
    void onEnviar(datos.texto, datos.claveEnvio).catch(() => {})
    reset({ texto: '', claveEnvio: crypto.randomUUID() })
    setFocus('texto')
  })

  return (
    <form
      noValidate
      onSubmit={(e) => void enviar(e)}
      aria-label="Enviar un mensaje"
      className="grid gap-2 rounded-lg border-2 border-l-8 border-line border-l-brand-accent bg-card p-4"
    >
      <TextareaField
        {...register('texto')}
        label="Mensaje"
        rows={3}
        maxLength={MAXIMO_MENSAJE_CHAT}
        hint="Enter agrega una línea. Para enviar, usá el botón o Ctrl + Enter. Los mensajes no se pueden modificar ni borrar."
        error={errors.texto?.message}
        className="min-h-24 text-lg"
        onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            void enviar()
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className={cn(
            'dato text-sm',
            quedan < AVISAR_DESDE ? 'font-semibold text-ink-2' : 'text-muted-foreground',
          )}
          aria-live={quedan < AVISAR_DESDE ? 'polite' : 'off'}
        >
          {quedan === 1 ? 'Queda 1 carácter' : `Quedan ${quedan} caracteres`}
        </p>
        <Button type="submit">
          <Send aria-hidden="true" />
          Enviar mensaje
        </Button>
      </div>
    </form>
  )
}
