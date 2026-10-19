// Límite de intentos de inicio de sesión fallidos. Solo cuenta los fallidos; entrar bien reinicia el contador.
// Vive en memoria: alcanza con un único proceso del backend y se reinicia si el backend se reinicia.
// Cuenta igual para emails que existen y que no, así no revela cuáles están registrados.

type Registro = { fallos: number; inicioVentana: number; bloqueadoHasta: number }

export type OpcionesLimite = {
  maximo: number
  ventanaMs: number
  bloqueoMs: number
  ahora?: () => number
}

export type LimiteIntentos = ReturnType<typeof crearLimiteIntentos>

export function crearLimiteIntentos({
  maximo,
  ventanaMs,
  bloqueoMs,
  ahora = Date.now,
}: OpcionesLimite) {
  const registros = new Map<string, Registro>()

  // Descarta lo que ya no bloquea ni está dentro de la ventana, para que el mapa no crezca sin fin
  function limpiar(t: number) {
    for (const [clave, r] of registros) {
      if (r.bloqueadoHasta <= t && t - r.inicioVentana > ventanaMs) registros.delete(clave)
    }
  }

  return {
    /** Milisegundos que faltan para poder volver a intentar (0 = puede intentar). */
    esperaRestante(clave: string): number {
      const r = registros.get(clave)
      return r ? Math.max(0, r.bloqueadoHasta - ahora()) : 0
    },

    /** Registra un intento fallido. Devuelve la espera que corresponde (0 si todavía puede intentar). */
    registrarFallo(clave: string): number {
      const t = ahora()
      if (registros.size > 10_000) limpiar(t)
      let r = registros.get(clave)
      if (!r || t - r.inicioVentana > ventanaMs) {
        r = { fallos: 0, inicioVentana: t, bloqueadoHasta: r?.bloqueadoHasta ?? 0 }
        registros.set(clave, r)
      }
      r.fallos += 1
      if (r.fallos >= maximo) {
        r.bloqueadoHasta = t + bloqueoMs
        r.fallos = 0
        r.inicioVentana = t
      }
      return Math.max(0, r.bloqueadoHasta - t)
    },

    reiniciar(clave: string) {
      registros.delete(clave)
    },
  }
}
