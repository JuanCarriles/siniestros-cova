import type { Server as ServidorHttp } from 'node:http'
import { getPrisma } from '../../lib/prisma.ts'
import { requerirSesion, sesiones } from '../auth/auth.module.ts'
import { crearChatRouter } from './chat.routes.ts'
import { crearServicioChat } from './chat.service.ts'
import { crearTiempoReal, tiempoReal } from './tiempo-real.ts'

/** Monta Socket.IO sobre el servidor HTTP de la API (mismo puerto). Lo llama server.ts al arrancar. */
export function montarTiempoReal(servidor: ServidorHttp) {
  const instancia = crearTiempoReal(servidor, { sesiones, base: () => getPrisma() })
  tiempoReal.montar(instancia)
  return () => {
    instancia.cerrar()
    tiempoReal.montar(null)
  }
}

export const chat = crearServicioChat({
  transaccion: (trabajo) => getPrisma().$transaction(trabajo, { timeout: 15_000 }),
  presentes: (idSiniestro) => tiempoReal.presentes(idSiniestro),
  repartir: (mensaje) => tiempoReal.emitirASala(mensaje.idSiniestro, 'chat:mensaje', mensaje),
  repartirLecturas: (lecturas) =>
    tiempoReal.emitirASala(lecturas.idSiniestro, 'chat:leido', lecturas),
})

export const chatRouter = crearChatRouter({ requerirSesion, chat })
