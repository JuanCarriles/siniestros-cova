import { z } from 'zod'
import {
  emailSchema,
  enteroSchema,
  esquemaEdicion,
  opcional,
  telefonoSchema,
  textoSchema,
} from './comunes.ts'

// Datos de alta de Abogado; id y baja lógica se gestionan por separado.
export const abogadoSchema = z.strictObject({
  nombreCompleto: textoSchema,
  telefono: opcional(telefonoSchema),
  numeroMatricula: opcional(enteroSchema),
  email: opcional(emailSchema),
})

export const abogadoUpdateSchema = esquemaEdicion(abogadoSchema)

export type AbogadoInput = z.input<typeof abogadoSchema>
export type AbogadoData = z.output<typeof abogadoSchema>
export type AbogadoUpdateInput = z.input<typeof abogadoUpdateSchema>
export type AbogadoUpdateData = z.output<typeof abogadoUpdateSchema>
