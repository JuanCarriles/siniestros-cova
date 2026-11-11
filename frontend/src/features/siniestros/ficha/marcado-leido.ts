// E7-03: cuándo pedir al servidor que marque la conversación como leída. Sin React, para probarlo con relojes
// simulados; el hook useConversacion le pasa el estado en cada render.
//
// - Al entrar se marca una vez aunque no haya nada pendiente (retira un aviso que haya quedado en la bandeja).
// - Después, cada vez que cambia el conjunto de mensajes sin leer mientras la conversación está a la vista.
// - Un pedido por vez. Si llega algo mientras hay uno en curso, al terminar se hace otra pasada.
// - Si el pedido falla, se reintenta solo, con espera creciente (1 s, 2 s, 4 s... hasta 30 s).
// - Si el servidor respondió bien pero el mismo conjunto sigue figurando sin leer (por ejemplo, se perdió el aviso
//   de que otra pestaña ya lo marcó), no se insiste: se vuelve a intentar cuando el conjunto cambie.

export type EstadoMarcado = {
  /** Unida a la sala y con la pestaña del navegador visible */
  activo: boolean
  /** Ids de los mensajes de otros sin leer, como texto (idsPorLeer); vacío si no hay */
  porLeer: string
}

export const ESPERA_MARCADO_MS = 400
const REINTENTO_MAXIMO_MS = 30_000

export const esperaReintento = (fallos: number) =>
  Math.min(REINTENTO_MAXIMO_MS, 1_000 * 2 ** Math.max(0, fallos - 1))

export function crearMarcadoLeido<R>(deps: {
  marcar: () => Promise<R>
  alMarcar: (resultado: R) => void
}) {
  let estado: EstadoMarcado = { activo: false, porLeer: '' }
  /** El conjunto que se marcó bien la última vez; null mientras no se marcó al entrar */
  let ultimo: string | null = null
  let enCurso = false
  let fallos = 0
  /** La espera antes de pedir, o la del reintento */
  let espera: ReturnType<typeof setTimeout> | undefined
  let cerrado = false

  function hayQueMarcar() {
    if (cerrado || !estado.activo || enCurso || espera !== undefined) return false
    return ultimo === null || (estado.porLeer !== '' && estado.porLeer !== ultimo)
  }

  function programar(ms: number) {
    espera = setTimeout(() => {
      espera = undefined
      if (hayQueMarcar()) void pedir()
    }, ms)
  }

  async function pedir() {
    enCurso = true
    const intentado = estado.porLeer
    let resultado: R
    try {
      resultado = await deps.marcar()
    } catch {
      enCurso = false
      if (cerrado) return
      fallos++
      programar(esperaReintento(fallos))
      return
    }
    enCurso = false
    if (cerrado) return
    ultimo = intentado
    fallos = 0
    deps.alMarcar(resultado)
    // Lo que llegó mientras tanto
    if (hayQueMarcar()) programar(ESPERA_MARCADO_MS)
  }

  return {
    /** El estado actual de la conversación (en cada cambio) */
    actualizar(nuevo: EstadoMarcado) {
      estado = nuevo
      if (hayQueMarcar()) programar(ESPERA_MARCADO_MS)
    },
    /** Al salir de la conversación: no pide más ni reintenta */
    cerrar() {
      cerrado = true
      clearTimeout(espera)
      espera = undefined
    },
  }
}
