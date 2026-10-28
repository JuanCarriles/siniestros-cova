import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type {
  ConsultaDashboardAdministrador,
  DashboardAdministrador,
} from '@cova/shared/schemas/dashboard'
import { DIAS_DEMORADO } from '@cova/shared/schemas/siniestros'
import type { Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'
import { eventoHistorial } from '../historial/historial.textos.ts'

type Trabajo<T> = (tx: Prisma.TransactionClient) => Promise<T>
export type BaseDashboardAdministrador = {
  lectura: <T>(trabajo: Trabajo<T>) => Promise<T>
  transaccion: <T>(trabajo: Trabajo<T>) => Promise<T>
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
      const sinAsignar = { ...activo, idUsuario: null } satisfies Prisma.SiniestroWhereInput
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
        gestor: s.usuario ? { id: s.usuario.id, nombre: nombre(s.usuario) } : null,
        fechaAsignacion: s.fechaAsignacion.toISOString(),
        diasSinMovimiento: dias(s.fechaUltimoMovimiento ?? s.fechaAsignacion),
        diasSinAsignar: dias(s.fechaAsignacion),
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
        const totalSinAsignar = await tx.siniestro.count({ where: sinAsignar })
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
        const ps = paginar('sin-asignar', totalSinAsignar)
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
        const filasSinAsignar = await tx.siniestro.findMany({
          where: sinAsignar,
          select: detalle,
          orderBy: [{ fechaAsignacion: 'asc' }, { id: 'asc' }],
          take: ps.porPagina,
          skip: (ps.pagina - 1) * ps.porPagina,
        })
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
          sinAsignar: { ...ps, items: filasSinAsignar.map(mapear) },
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
    async gestores(actor: SesionUsuario) {
      exigirAdministrador(actor)
      return base.lectura(async (tx) =>
        (
          await tx.usuario.findMany({
            where: { tipoUsuario: 'GESTOR', eliminado: false },
            select: { id: true, nombres: true, apellidos: true },
            orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }, { id: 'asc' }],
          })
        ).map((u) => ({ id: u.id, nombre: nombre(u) })),
      )
    },
    async asignar(actor: SesionUsuario, id: number, idUsuario: number) {
      exigirAdministrador(actor)
      return base.transaccion(async (tx) => {
        const autor = await tx.usuario.findFirst({ where: { id: actor.id, eliminado: false } })
        if (!autor) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
        exigirAdministrador(autor)
        // Mismo orden que baja/reactivación: primero el caso y después el destinatario.
        await tx.$queryRaw`SELECT "id" FROM "Siniestro" WHERE "id" = ${id} FOR UPDATE`
        const siniestro = await tx.siniestro.findUnique({
          where: { id },
          select: { id: true, numeroSiniestro: true },
        })
        if (!siniestro)
          throw new HttpError(404, 'El siniestro ya no existe. Actualizá el dashboard.')
        await tx.$queryRaw`SELECT "id" FROM "Usuario" WHERE "id" = ${idUsuario} FOR UPDATE`
        const gestor = await tx.usuario.findFirst({
          where: { id: idUsuario, eliminado: false, tipoUsuario: 'GESTOR' },
        })
        if (!gestor)
          throw new HttpError(
            409,
            'El usuario elegido ya no es un gestor activo. Actualizá y elegí otro.',
          )
        const ahora = reloj()
        const cambio = await tx.siniestro.updateMany({
          where: { id, ...activo, idUsuario: null },
          data: { idUsuario, fechaUltimoMovimiento: ahora, demorado: false },
        })
        if (cambio.count !== 1)
          throw new HttpError(
            409,
            'Este siniestro ya tiene gestor, está cerrado o fue dado de baja. Actualizá el dashboard.',
          )
        await tx.historialSiniestro.create({
          data: {
            idSiniestro: id,
            idUsuario: autor.id,
            fechaEvento: ahora,
            ...eventoHistorial.asignacion(gestor, ahora),
          },
        })
        await tx.notificacion.create({
          data: {
            idSiniestro: id,
            idUsuario,
            tipoNotificacion: 'ASIGNACION_SINIESTRO',
            mensaje: `Se te asignó el siniestro ${siniestro.numeroSiniestro}.`,
            leida: false,
            revisada: false,
            fechaCreacion: ahora,
          },
        })
      })
    },
  }
}
