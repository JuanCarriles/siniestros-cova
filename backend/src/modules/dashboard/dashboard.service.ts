import type { SesionUsuario } from '@cova/shared/schemas/auth'
import { PERICIAS_DASHBOARD_POR_PAGINA, type DashboardGestor } from '@cova/shared/schemas/dashboard'
import { DIAS_DEMORADO } from '@cova/shared/schemas/siniestros'
import type { Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'

type BaseDashboard = {
  transaccion: <T>(trabajo: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>
}
const DIA_MS = 86_400_000

export function crearServicioDashboard(base: BaseDashboard, reloj = () => new Date()) {
  return {
    async obtenerGestor(usuario: SesionUsuario, paginaPericias: number): Promise<DashboardGestor> {
      if (usuario.tipoUsuario !== 'GESTOR') {
        throw new HttpError(403, 'Este dashboard muestra el trabajo asignado a un gestor.')
      }
      const ahora = reloj()
      const limite = new Date(ahora.getTime() - DIAS_DEMORADO * DIA_MS)
      const activos = {
        idUsuario: usuario.id,
        eliminado: false,
        eliminacionEnCurso: false,
        estadoSiniestro: { esCierre: false },
      } satisfies Prisma.SiniestroWhereInput
      const pendientes = {
        eliminado: false,
        cerrado: false,
        siniestro: activos,
      } satisfies Prisma.PeritoWhereInput

      // El módulo ejecuta todo en una misma instantánea de lectura (RepeatableRead): los contadores
      // y la página de pericias representan el mismo estado, aunque otro usuario actualice un caso.
      return base.transaccion(async (tx) => {
        const cantidadActivos = await tx.siniestro.count({ where: activos })
        const demorados = await tx.siniestro.count({
          where: {
            ...activos,
            OR: [
              { fechaUltimoMovimiento: { lte: limite } },
              { fechaUltimoMovimiento: null, fechaAsignacion: { lte: limite } },
            ],
          },
        })
        const total = await tx.perito.count({ where: pendientes })
        const porPagina = PERICIAS_DASHBOARD_POR_PAGINA
        const pagina = Math.min(paginaPericias, Math.max(1, Math.ceil(total / porPagina)))
        const pericias = await tx.perito.findMany({
          where: pendientes,
          orderBy: [{ fechaSolicitud: 'asc' }, { id: 'asc' }],
          skip: (pagina - 1) * porPagina,
          take: porPagina,
          select: {
            id: true,
            nombre: true,
            tipoPerito: true,
            fechaSolicitud: true,
            siniestro: {
              select: {
                id: true,
                numeroSiniestro: true,
                aseguradora: { select: { nombre: true } },
              },
            },
          },
        })
        return {
          actualizadoEn: ahora.toISOString(),
          casos: { activos: cantidadActivos, alDia: cantidadActivos - demorados, demorados },
          periciasPendientes: {
            total,
            pagina,
            porPagina,
            items: pericias.map((pericia) => ({
              ...pericia,
              fechaSolicitud: pericia.fechaSolicitud.toISOString(),
              diasEspera: Math.max(
                0,
                Math.floor((ahora.getTime() - pericia.fechaSolicitud.getTime()) / DIA_MS),
              ),
              siniestro: {
                ...pericia.siniestro,
                aseguradora: pericia.siniestro.aseguradora.nombre,
              },
            })),
          },
        }
      })
    },
  }
}
