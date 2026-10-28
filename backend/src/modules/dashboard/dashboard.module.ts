import { getPrisma } from '../../lib/prisma.ts'
import { requerirSesion } from '../auth/auth.module.ts'
import { crearDashboardRouter } from './dashboard.routes.ts'
import {
  crearServicioDashboardAdministrador,
  type BaseDashboardAdministrador,
} from './dashboard-administrador.service.ts'
import { HttpError } from '../../utils/httpError.ts'
import { crearServicioDashboard } from './dashboard.service.ts'

function campo(valor: unknown, clave: string): unknown {
  return valor && typeof valor === 'object' && clave in valor
    ? (valor as Record<string, unknown>)[clave]
    : undefined
}

export const baseDashboardAdministrador: BaseDashboardAdministrador = {
  lectura: (trabajo) =>
    getPrisma().$transaction(trabajo, { isolationLevel: 'RepeatableRead', timeout: 10_000 }),
  async transaccion(trabajo) {
    for (let intento = 0; ; intento++) {
      try {
        return await getPrisma().$transaction(trabajo, {
          isolationLevel: 'Serializable',
          timeout: 10_000,
        })
      } catch (error) {
        const codigo = campo(error, 'code')
        const meta = campo(error, 'meta')
        const causa = campo(campo(meta, 'driverAdapterError'), 'cause')
        const sql = campo(meta, 'code') ?? campo(causa, 'originalCode')
        // Las consultas Prisma y los bloqueos SQL crudos reportan el conflicto con códigos distintos.
        const conflicto =
          codigo === 'P2034' || (codigo === 'P2010' && (sql === '40001' || sql === '40P01'))
        if (conflicto && intento < 2) continue
        if (conflicto)
          throw new HttpError(
            409,
            'Los datos cambiaron mientras asignabas. Actualizá el dashboard e intentá de nuevo.',
          )
        throw error
      }
    }
  },
}

export const dashboardRouter = crearDashboardRouter({
  servicio: crearServicioDashboard({ transaccion: baseDashboardAdministrador.lectura }),
  administrador: crearServicioDashboardAdministrador(baseDashboardAdministrador),
  requerirSesion,
})
