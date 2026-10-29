import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type {
  ConsultaDashboardAdministrador,
  DashboardAdministrador,
} from '@cova/shared/schemas/dashboard'
import { DIAS_DEMORADO } from '@cova/shared/schemas/siniestros'
import type { Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'

type Trabajo<T> = (tx: Prisma.TransactionClient) => Promise<T>
export type BaseDashboardAdministrador = {
  lectura: <T>(trabajo: Trabajo<T>) => Promise<T>
}
const DIA = 86_400_000
const nombre = (p: { nombres: string; apellidos: string }) => `${p.nombres} ${p.apellidos}`
const visible = { eliminado: false, eliminacionEnCurso: false } satisfies Prisma.SiniestroWhereInput
const activo = {
  ...visible,
  estadoSiniestro: { esCierre: false },
} satisfies Prisma.SiniestroWhereInput
const detalle = {
  id: true,
  numeroSiniestro: true,
  fechaAsignacion: true,
  fechaUltimoMovimiento: true,
  aseguradora: { select: { nombre: true } },
  estadoSiniestro: { select: { nombre: true } },
  usuario: { select: { id: true, nombres: true, apellidos: true } },
  personasInvolucradas: {
    where: { eliminado: false, esPropietario: true, vehiculo: { rolAccidente: 'ASEGURADO' } },
    select: { nombreCompletoRazonSocial: true },
    orderBy: { id: 'asc' },
    take: 1,
  },
} as const satisfies Prisma.SiniestroSelect

function exigirAdministrador(actor: SesionUsuario) {
  if (actor.tipoUsuario !== 'ADMINISTRADOR' && actor.tipoUsuario !== 'SUPER_ADMINISTRADOR') {
    throw new HttpError(
      403,
      'Solo un administrador o superadministrador puede acceder al dashboard del estudio y asignar gestores.',
    )
  }
}

export function crearServicioDashboardAdministrador(
  base: BaseDashboardAdministrador,
  reloj = () => new Date(),
) {
  return {
    async obtener(
      actor: SesionUsuario,
      consulta: ConsultaDashboardAdministrador,
    ): Promise<DashboardAdministrador> {
      exigirAdministrador(actor)
      const ahora = reloj()
      const limite = new Date(ahora.getTime() - DIAS_DEMORADO * DIA)
      const demora = {
        ...activo,
        OR: [
          { fechaUltimoMovimiento: { lte: limite } },
          { fechaUltimoMovimiento: null, fechaAsignacion: { lte: limite } },
        ],
      } satisfies Prisma.SiniestroWhereInput
      // La actividad de casos de baja sigue en su historial; este panel solo enlaza casos disponibles.
      const actividad = {
        eliminado: false,
        siniestro: visible,
      } satisfies Prisma.HistorialSiniestroWhereInput
      const dias = (desde: Date) =>
        Math.max(0, Math.floor((ahora.getTime() - desde.getTime()) / DIA))
      const mapear = (s: Prisma.SiniestroGetPayload<{ select: typeof detalle }>) => ({
        id: s.id,
        numeroSiniestro: s.numeroSiniestro,
        aseguradora: s.aseguradora.nombre,
        asegurado: s.personasInvolucradas[0]?.nombreCompletoRazonSocial?.trim() || null,
        estado: s.estadoSiniestro.nombre,
        gestor: { id: s.usuario.id, nombre: nombre(s.usuario) },
        fechaAsignacion: s.fechaAsignacion.toISOString(),
        diasSinMovimiento: dias(s.fechaUltimoMovimiento ?? s.fechaAsignacion),
      })
      return base.lectura(async (tx) => {
        const grupos = await tx.siniestro.groupBy({
          by: ['idEstadoSiniestro'],
          where: visible,
          _count: { _all: true },
        })
        const estados = await tx.estadoSiniestro.findMany({
          where: { OR: [{ eliminado: false }, { siniestros: { some: visible } }] },
          select: { id: true, nombre: true, esCierre: true },
          orderBy: { id: 'asc' },
        })
        const totalDemorados = await tx.siniestro.count({ where: demora })
        const totalActividad = await tx.historialSiniestro.count({ where: actividad })
        const paginar = (bloque: string, total: number) => {
          const porPagina = consulta.ver === bloque ? (25 as const) : (5 as const)
          const pagina =
            consulta.ver === bloque
              ? Math.min(consulta.pagina, Math.max(1, Math.ceil(total / porPagina)))
              : 1
          return { total, porPagina, pagina }
        }
        const pd = paginar('demorados', totalDemorados)
        const pa = paginar('actividad', totalActividad)
        // COALESCE ordena correctamente también los casos que nunca tuvieron un movimiento.
        const ids = await tx.$queryRaw<{ id: number }[]>`
          SELECT s."id" FROM "Siniestro" s
          JOIN "EstadoSiniestro" e ON e."id" = s."idEstadoSiniestro"
          WHERE NOT s."eliminado" AND NOT s."eliminacionEnCurso" AND NOT e."esCierre"
            AND COALESCE(s."fechaUltimoMovimiento", s."fechaAsignacion") <= ${limite}
          ORDER BY COALESCE(s."fechaUltimoMovimiento", s."fechaAsignacion") ASC, s."id" ASC
          LIMIT ${pd.porPagina} OFFSET ${(pd.pagina - 1) * pd.porPagina}`
        const filasDemoradas = await tx.siniestro.findMany({
          where: { id: { in: ids.map((s) => s.id) } },
          select: detalle,
        })
        const porId = new Map(filasDemoradas.map((s) => [s.id, s]))
        const eventos = await tx.historialSiniestro.findMany({
          where: actividad,
          orderBy: [{ fechaEvento: 'desc' }, { id: 'desc' }],
          take: pa.porPagina,
          skip: (pa.pagina - 1) * pa.porPagina,
          select: {
            id: true,
            descripcion: true,
            fechaEvento: true,
            usuario: { select: { nombres: true, apellidos: true } },
            siniestro: { select: { id: true, numeroSiniestro: true } },
          },
        })
        const cantidades = new Map(grupos.map((g) => [g.idEstadoSiniestro, g._count._all]))
        return {
          actualizadoEn: ahora.toISOString(),
          totalSiniestros: grupos.reduce((n, g) => n + g._count._all, 0),
          estados: estados.map((e) => ({ ...e, cantidad: cantidades.get(e.id) ?? 0 })),
          demorados: { ...pd, items: ids.map((s) => mapear(porId.get(s.id)!)) },
          actividad: {
            ...pa,
            items: eventos.map((e) => ({
              id: e.id,
              descripcion: e.descripcion,
              fecha: e.fechaEvento.toISOString(),
              autor: nombre(e.usuario),
              siniestro: e.siniestro,
            })),
          },
        }
      })
    },
  }
}
