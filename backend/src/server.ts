import { createServer } from 'node:http'
import { app } from './app.ts'
import { env } from './config/env.ts'
import { disconnectPrisma } from './lib/prisma.ts'
import { programarTarea } from './lib/tarea-periodica.ts'
import { montarTiempoReal } from './modules/chat/chat.module.ts'
import { tareaDemoras } from './modules/siniestros/demoras.module.ts'
import { tiempoReal } from './modules/chat/tiempo-real.ts'
import { escucharCambiosNotificaciones } from './modules/notificaciones/notificaciones-receptor.ts'
import { servicioInformes } from './modules/informes/informes.module.ts'

// Servidor HTTP propio (y no app.listen) para poder montar Socket.IO sobre el mismo puerto.
const server = createServer(app)
// E7-01: chat en tiempo real, en /socket.io
const cerrarTiempoReal = montarTiempoReal(server)
const notificacionesEnVivo = escucharCambiosNotificaciones({
  conexion: () => process.env.DATABASE_URL,
  avisar: (id, nueva) => tiempoReal.avisarNotificaciones(id, nueva),
  resincronizar: () => tiempoReal.resincronizarNotificaciones(),
})

server.listen(env.PORT, () => {
  console.log(`API escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`)
})

// RF-19 (E5-10): avisos de casos demorados. La primera revisión, un minuto después de arrancar.
const detenerDemoras = env.DEMORAS_CADA_MINUTOS
  ? programarTarea(
      'casos demorados',
      async () => {
        const r = await tareaDemoras.revisar()
        if (r.avisos)
          console.log(`Casos demorados: ${r.avisos} avisos nuevos en ${r.casos} siniestros.`)
      },
      { cadaMs: env.DEMORAS_CADA_MINUTOS * 60_000, primeraEnMs: 60_000 },
    )
  : () => {}

const detenerInformes = env.INFORMES_AUTOMATICOS
  ? programarTarea('informes mensuales', () => servicioInformes.revisarPendientes(), {
      cadaMs: 15 * 60_000,
      primeraEnMs: 30_000,
    })
  : () => {}

// Docker manda SIGTERM al detener el contenedor: se cierran las conexiones (HTTP y base) antes de salir.
function shutdown(signal: string) {
  console.log(`${signal} recibido, cerrando servidor…`)
  detenerDemoras()
  detenerInformes()
  void notificacionesEnVivo.cerrar()
  cerrarTiempoReal()
  server.close(() => {
    void disconnectPrisma().finally(() => process.exit(0))
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
