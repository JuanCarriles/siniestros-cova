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
