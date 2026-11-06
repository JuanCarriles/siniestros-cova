/**
 * Corre `tarea` cada `cadaMs` dentro del mismo proceso del servidor, la primera vez a los `primeraEnMs`. Si una vuelta
 * todavía no terminó cuando toca la siguiente, esa se saltea. Un error queda en el log y no frena las próximas.
 * Los temporizadores no mantienen vivo el proceso. Devuelve la función que la detiene (al cerrar el servidor).
 */
export function programarTarea(
  nombre: string,
  tarea: () => Promise<void>,
  { cadaMs, primeraEnMs }: { cadaMs: number; primeraEnMs: number },
) {
  let corriendo = false
  const correr = async () => {
    if (corriendo) return
    corriendo = true
    try {
      await tarea()
    } catch (error) {
      console.error(`La tarea "${nombre}" falló; se reintenta en la próxima vuelta.`, error)
    } finally {
      corriendo = false
    }
  }
  const primera = setTimeout(() => void correr(), primeraEnMs)
  const siguientes = setInterval(() => void correr(), cadaMs)
  primera.unref()
  siguientes.unref()
  return () => {
    clearTimeout(primera)
    clearInterval(siguientes)
  }
}
