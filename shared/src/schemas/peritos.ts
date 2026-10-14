import { z } from 'zod'
import { booleanoSchema, emailSchema, esquemaEdicion, fechaHoraSchema, idSchema, opcional, telefonoSchema, textoSchema } from './comunes.ts'
import { tipoPeritoSchema } from './enums.ts'

// Datos de alta de Perito; id y baja lógica se gestionan por separado.
export const peritoSchema = z.strictObject({
  nombre: textoSchema,
  fechaSolicitud: fechaHoraSchema,
  cerrado: booleanoSchema,
  idSiniestro: idSchema,
  tipoPerito: tipoPeritoSchema,
  telefono: opcional(telefonoSchema),
  email: opcional(emailSchema),
  fechaCierre: opcional(fechaHoraSchema),
  idDireccion: opcional(idSchema),
})

export const peritoUpdateSchema = esquemaEdicion(peritoSchema)

export type PeritoInput = z.input<typeof peritoSchema>
export type PeritoData = z.output<typeof peritoSchema>
export type PeritoUpdateInput = z.input<typeof peritoUpdateSchema>
export type PeritoUpdateData = z.output<typeof peritoUpdateSchema>
