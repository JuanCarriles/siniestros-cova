import { createServer } from 'node:http'
import { app } from './app.ts'
import { env } from './config/env.ts'
import { disconnectPrisma } from './lib/prisma.ts'

// Servidor HTTP propio (y no app.listen) para poder montar Socket.IO sobre el mismo puerto.
const server = createServer(app)

server.listen(env.PORT, () => {
  console.log(`API escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`)
})

// Docker manda SIGTERM al detener el contenedor: se cierran las conexiones (HTTP y base) antes de salir.
function shutdown(signal: string) {
  console.log(`${signal} recibido, cerrando servidor…`)
  server.close(() => {
    void disconnectPrisma().finally(() => process.exit(0))
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
