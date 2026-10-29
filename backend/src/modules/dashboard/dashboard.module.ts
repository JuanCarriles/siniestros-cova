import { getPrisma } from '../../lib/prisma.ts'
import { requerirSesion } from '../auth/auth.module.ts'
import { crearDashboardRouter } from './dashboard.routes.ts'
import {
  crearServicioDashboardAdministrador,
  type BaseDashboardAdministrador,
} from './dashboard-administrador.service.ts'
import { crearServicioDashboard } from './dashboard.service.ts'

export const baseDashboardAdministrador: BaseDashboardAdministrador = {
  lectura: (trabajo) =>
    getPrisma().$transaction(trabajo, { isolationLevel: 'RepeatableRead', timeout: 10_000 }),
}
export const dashboardRouter = crearDashboardRouter({
  servicio: crearServicioDashboard({ transaccion: baseDashboardAdministrador.lectura }),
  administrador: crearServicioDashboardAdministrador(baseDashboardAdministrador),
  requerirSesion,
})
