import { getPrisma } from '../../lib/prisma.ts'
import { requerirSesion } from '../auth/auth.module.ts'
import { crearDashboardRouter } from './dashboard.routes.ts'
import { crearServicioDashboard } from './dashboard.service.ts'

export const dashboardRouter = crearDashboardRouter({
  servicio: crearServicioDashboard({
    transaccion: (trabajo) =>
      getPrisma().$transaction(trabajo, {
        isolationLevel: 'RepeatableRead',
        timeout: 10_000,
      }),
  }),
  requerirSesion,
})
