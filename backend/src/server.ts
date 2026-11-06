import { createServer } from 'node:http'
import { app } from './app.ts'
import { env } from './config/env.ts'
import { disconnectPrisma } from './lib/prisma.ts'
import { programarTarea } from './lib/tarea-periodica.ts'
import { tareaDemoras } from './modules/siniestros/demoras.module.ts'

// Servidor HTTP propio (y no app.listen) para poder montar Socket.IO sobre el mismo puerto.
const server = createServer(app)

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

// Docker manda SIGTERM al detener el contenedor: se cierran las conexiones (HTTP y base) antes de salir.
function shutdown(signal: string) {
  console.log(`${signal} recibido, cerrando servidor…`)
  detenerDemoras()
  server.close(() => {
    void disconnectPrisma().finally(() => process.exit(0))
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
