import { Client } from 'pg'
import { z } from 'zod'

const CANAL = 'cova_notificaciones'
const cambioSchema = z.strictObject({
  idUsuario: z.number().int().positive().safe(),
  nueva: z.boolean(),
})

/** LISTEN recibe únicamente transacciones confirmadas. Cada instancia de la API escucha el mismo canal
 * y avisa solo a sus conexiones locales; no se transportan mensajes, números de caso ni credenciales. */
export function escucharCambiosNotificaciones(deps: {
  conexion: () => string | undefined
  avisar: (idUsuario: number, nueva: boolean) => Promise<void>
  resincronizar: () => Promise<void>
}) {
  let cliente: Client | null = null
  let cerrado = false
  let espera = 1000
  let reintento: ReturnType<typeof setTimeout> | undefined
  let lote: ReturnType<typeof setTimeout> | undefined
  const pendientes = new Map<number, boolean>()
  let confirmarListo: () => void = () => {}
  const listo = new Promise<void>((resolve) => {
    confirmarListo = resolve
  })

  function programarLote() {
    if (lote || cerrado) return
    lote = setTimeout(() => {
      lote = undefined
      const cambios = [...pendientes]
      pendientes.clear()
      void Promise.all(cambios.map(([id, nueva]) => deps.avisar(id, nueva))).catch(() => {
        console.warn(
          'No se pudo actualizar una bandeja en tiempo real; la consulta de respaldo sigue activa.',
        )
      })
    }, 40)
    lote.unref()
  }

  async function conectar() {
    if (cerrado) return
    const conexion = deps.conexion()
    const actual = new Client({
      connectionString: conexion,
      connectionTimeoutMillis: 5000,
      application_name: 'cova-notificaciones',
    })
    cliente = actual
    const fallar = () => {
      if (cliente !== actual) return
      cliente = null
      void actual.end().catch(() => {})
      if (cerrado) return
      console.warn('Se interrumpió la escucha de notificaciones; se reconectará automáticamente.')
      reintento = setTimeout(() => {
        void conectar()
      }, espera)
      reintento.unref()
      espera = Math.min(espera * 2, 30000)
    }
    actual.on('error', fallar)
    actual.on('end', fallar)
    actual.on('notification', (evento) => {
      if (cerrado || cliente !== actual || evento.channel !== CANAL || !evento.payload) return
      let datos: unknown
      try {
        datos = JSON.parse(evento.payload)
      } catch {
        return
      }
      const cambio = cambioSchema.safeParse(datos)
      if (!cambio.success) return
      const { idUsuario, nueva } = cambio.data
      pendientes.set(idUsuario, nueva || pendientes.get(idUsuario) === true)
      programarLote()
    })
    try {
      if (!conexion) throw new Error('Falta DATABASE_URL')
      await actual.connect()
      if (cerrado || cliente !== actual) {
        await actual.end()
        return
      }
      await actual.query(`LISTEN ${CANAL}`)
      if (cerrado || cliente !== actual) return
      espera = 1000
      confirmarListo()
      // Recupera cambios ocurridos durante una caída de la conexión a PostgreSQL.
      await deps.resincronizar()
    } catch {
      fallar()
    }
  }
  void conectar()
  return {
    listo,
    async cerrar() {
      cerrado = true
      clearTimeout(reintento)
      clearTimeout(lote)
      pendientes.clear()
      const actual = cliente
      cliente = null
      await actual?.end().catch(() => {})
    },
  }
}
