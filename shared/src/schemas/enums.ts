import { z } from 'zod'

// Valores de backend/prisma/schema.prisma; sin importar el cliente Prisma al navegador.
export const tipoUsuarioSchema = z.enum(['GESTOR', 'ADMINISTRADOR', 'SUPER_ADMINISTRADOR'])
export type TipoUsuario = z.infer<typeof tipoUsuarioSchema>

export const tipoNotificacionSchema = z.enum([
  'DOCUMENTO_NUEVO',
  'NOVEDAD_CARGADA',
  'CAMBIO_ESTADO',
  'MENSAJE_NUEVO',
  'ASIGNACION_SINIESTRO',
  'REASIGNACION_SINIESTRO',
])
export type TipoNotificacion = z.infer<typeof tipoNotificacionSchema>

export const tipoEventoHistorialSchema = z.enum([
  'MENSAJE',
  'NOVEDAD',
  'DOCUMENTO',
  'ASIGNACION',
  'REASIGNACION',
  'CAMBIO_ESTADO',
])
export type TipoEventoHistorial = z.infer<typeof tipoEventoHistorialSchema>

export const tipoPeritoSchema = z.enum(['CESVI', 'MEDICO'])
export type TipoPerito = z.infer<typeof tipoPeritoSchema>

export const rolAccidenteSchema = z.enum(['TERCERO', 'ASEGURADO'])
export type RolAccidente = z.infer<typeof rolAccidenteSchema>

export const usoVehiculoSchema = z.enum(['COMERCIAL', 'PARTICULAR', 'TRANSPORTE_PASAJEROS'])
export type UsoVehiculo = z.infer<typeof usoVehiculoSchema>

export const tipoLesionSchema = z.enum(['LEVE', 'MODERADA', 'GRAVE', 'MUERTE'])
export type TipoLesion = z.infer<typeof tipoLesionSchema>
