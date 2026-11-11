import type { Server as ServidorHttp } from 'node:http'
import { getPrisma } from '../../lib/prisma.ts'
import { sesiones } from '../auth/auth.module.ts'
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
