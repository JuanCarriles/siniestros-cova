import { z } from 'zod'
import { idSchema } from './comunes.ts'
import { tipoNotificacionSchema } from './enums.ts'

export const lecturaNotificacionesSchema = z.enum(['todas', 'sin-leer', 'leidas'])
export const revisionNotificacionesSchema = z.enum(['todas', 'pendientes', 'revisadas'])
export const consultaNotificacionesSchema = z.strictObject({
  pagina: idSchema.default(1),
  tipo: tipoNotificacionSchema.optional(),
  lectura: lecturaNotificacionesSchema.default('todas'),
  revision: revisionNotificacionesSchema.default('todas'),
})
export type ConsultaNotificaciones = z.output<typeof consultaNotificacionesSchema>
export const marcarLecturaSchema = z.strictObject({ leida: z.boolean().default(true) })
export const marcarRevisionSchema = z.strictObject({ revisada: z.boolean() })
export const lecturasNotificacionesSchema = z.union([
  z.strictObject({ ids: z.array(idSchema).min(1).max(100) }),
  z.strictObject({ todas: z.literal(true) }),
])
export type LecturasNotificaciones = z.output<typeof lecturasNotificacionesSchema>
export const notificacionBandejaSchema = z.strictObject({
  id: z.int().positive(),
  mensaje: z.string(),
  fecha: z.iso.datetime(),
  tipo: tipoNotificacionSchema,
  leida: z.boolean(),
  revisada: z.boolean(),
  puedeAbrirSiniestro: z.boolean(),
  motivoSinAcceso: z.string().nullable(),
  siniestro: z.strictObject({ id: z.int().positive(), numeroSiniestro: z.string() }),
})
export const resumenNotificacionesSchema = z.strictObject({
  sinLeer: z.int().nonnegative(),
  sinRevisar: z.int().nonnegative(),
})
export type ResumenNotificaciones = z.output<typeof resumenNotificacionesSchema>

export const bandejaNotificacionesSchema = z.strictObject({
  total: z.int().nonnegative(),
  totalGeneral: z.int().nonnegative(),
  sinLeer: z.int().nonnegative(),
  sinRevisar: z.int().nonnegative(),
  pagina: z.int().positive(),
  porPagina: z.literal(20),
  items: z.array(notificacionBandejaSchema),
})
export type NotificacionBandeja = z.output<typeof notificacionBandejaSchema>
export type BandejaNotificaciones = z.output<typeof bandejaNotificacionesSchema>

/** La URL de la pantalla solo admite filtros conocidos. La API, en cambio, rechaza parámetros inválidos. */
export function parametrosNotificaciones(params: {
  get(nombre: string): string | null
}): ConsultaNotificaciones {
  const tipo = tipoNotificacionSchema.safeParse(params.get('tipo')).data
  return consultaNotificacionesSchema.parse({
    pagina: idSchema.safeParse(params.get('pagina') ?? 1).data ?? 1,
    ...(tipo ? { tipo } : {}),
    lectura: lecturaNotificacionesSchema.safeParse(params.get('lectura')).data ?? 'todas',
    revision: revisionNotificacionesSchema.safeParse(params.get('revision')).data ?? 'todas',
  })
}
export function queryNotificaciones(consulta: ConsultaNotificaciones): string {
  const pares: string[] = []
  const agregar = (clave: string, valor: string) =>
    pares.push(`${encodeURIComponent(clave)}=${encodeURIComponent(valor)}`)
  if (consulta.pagina > 1) agregar('pagina', String(consulta.pagina))
  if (consulta.tipo) agregar('tipo', consulta.tipo)
  if (consulta.lectura !== 'todas') agregar('lectura', consulta.lectura)
  if (consulta.revision !== 'todas') agregar('revision', consulta.revision)
  return pares.join('&')
}
