import { z } from 'zod'
import { idSchema } from './comunes.ts'
import {
  ocupanteAltaSchema,
  personaExternaAltaSchema,
  titularAltaSchema,
} from './siniestros-alta.ts'

// Vehículos y personas desde la ficha (CU-10 1.c, E5-06). Los datos se validan con los mismos schemas del alta:
// un vehículo con vehiculoAltaSchema; una persona según dónde está.

/** POST /api/siniestros/:id/personas. El titular y el ocupante dicen en qué vehículo; la persona fuera, no. */
export const agregarPersonaSchema = z.discriminatedUnion('tipo', [
  z.strictObject({ tipo: z.literal('titular'), idVehiculo: idSchema, datos: titularAltaSchema }),
  z.strictObject({ tipo: z.literal('ocupante'), idVehiculo: idSchema, datos: ocupanteAltaSchema }),
  z.strictObject({ tipo: z.literal('externa'), datos: personaExternaAltaSchema }),
])
export type AgregarPersona = z.output<typeof agregarPersonaSchema>
export type AgregarPersonaInput = z.input<typeof agregarPersonaSchema>

/** Respuesta de agregar un vehículo o una persona */
export type ParteCreada = { id: number }

/** 409 al dar de baja un vehículo con titular u ocupantes (CU-10 1.c.6.1): a quiénes dar de baja primero */
export type VehiculoConPersonas = {
  codigo: 'VEHICULO_CON_PERSONAS'
  personas: { id: number; nombre: string | null; rol: 'titular' | 'ocupante' }[]
}
