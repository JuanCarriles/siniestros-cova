import { z } from 'zod'
import { fechaHoraSchema, idSchema } from './comunes.ts'
import { tipoPeritoSchema } from './enums.ts'

export const PERICIAS_DASHBOARD_POR_PAGINA = 5

// El gestor se obtiene exclusivamente de la sesión, nunca de un filtro enviado por el cliente.
export const consultaDashboardGestorSchema = z.strictObject({
  paginaPericias: idSchema.optional().default(1),
})

const cantidad = z.number().int().nonnegative()
export const dashboardGestorSchema = z.strictObject({
  actualizadoEn: fechaHoraSchema,
  casos: z.strictObject({ activos: cantidad, alDia: cantidad, demorados: cantidad }),
  periciasPendientes: z.strictObject({
    total: cantidad,
    pagina: z.number().int().positive(),
    porPagina: z.literal(PERICIAS_DASHBOARD_POR_PAGINA),
    items: z.array(
      z.strictObject({
        id: z.number().int().positive(),
        nombre: z.string(),
        tipoPerito: tipoPeritoSchema,
        fechaSolicitud: fechaHoraSchema,
        diasEspera: cantidad,
        siniestro: z.strictObject({
          id: z.number().int().positive(),
          numeroSiniestro: z.string(),
          aseguradora: z.string(),
        }),
      }),
    ),
  }),
})

export type DashboardGestor = z.output<typeof dashboardGestorSchema>

export const bloqueDashboardSchema = z.enum(['demorados', 'sin-asignar', 'actividad'])
export type BloqueDashboard = z.output<typeof bloqueDashboardSchema>
export const consultaDashboardAdministradorSchema = z.strictObject({
  ver: bloqueDashboardSchema.optional(),
  pagina: idSchema.optional().default(1),
})
const personaDashboardSchema = z.strictObject({ id: idSchema, nombre: z.string() })
const casoDashboardSchema = z.strictObject({
  asegurado: z.string().nullable(),
  id: idSchema,
  numeroSiniestro: z.string(),
  aseguradora: z.string(),
  estado: z.string(),
  gestor: personaDashboardSchema.nullable(),
  fechaAsignacion: fechaHoraSchema,
  diasSinMovimiento: cantidad,
  diasSinAsignar: cantidad,
})
const paginaDashboard = <T extends z.ZodType>(item: T) =>
  z.strictObject({
    total: cantidad,
    pagina: idSchema,
    porPagina: z.union([z.literal(5), z.literal(25)]),
    items: z.array(item),
  })
export const dashboardAdministradorSchema = z.strictObject({
  actualizadoEn: fechaHoraSchema,
  totalSiniestros: cantidad,
  estados: z.array(
    z.strictObject({ id: idSchema, nombre: z.string(), esCierre: z.boolean(), cantidad }),
  ),
  demorados: paginaDashboard(casoDashboardSchema),
  sinAsignar: paginaDashboard(casoDashboardSchema),
  actividad: paginaDashboard(
    z.strictObject({
      id: idSchema,
      descripcion: z.string(),
      fecha: fechaHoraSchema,
      autor: z.string(),
      siniestro: z.strictObject({ id: idSchema, numeroSiniestro: z.string() }),
    }),
  ),
})
export const gestoresDashboardSchema = z.array(personaDashboardSchema)
export const asignarGestorDashboardSchema = z.strictObject({ idUsuario: idSchema })
export type DashboardAdministrador = z.output<typeof dashboardAdministradorSchema>
export type CasoDashboard = z.output<typeof casoDashboardSchema>
export type ConsultaDashboardAdministrador = z.output<typeof consultaDashboardAdministradorSchema>
