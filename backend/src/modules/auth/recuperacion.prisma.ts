import { getPrisma } from '../../lib/prisma.ts'
import type { BaseRecuperacion } from './recuperacion.service.ts'

// Serializable evita verificar/consumir dos veces un mismo código o token ante pedidos simultáneos.
export const baseRecuperacion: BaseRecuperacion = {
  async transaccion(trabajo) {
    for (let intento = 0; ; intento++) {
      try {
        return await getPrisma().$transaction(trabajo, { isolationLevel: 'Serializable' })
      } catch (error) {
        if (intento < 3 && error instanceof Error && 'code' in error && error.code === 'P2034')
          continue
        throw error
      }
    }
  },
}
