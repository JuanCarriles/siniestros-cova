import { z } from 'zod'
import { idSchema } from './comunes.ts'
import {
  abogadoAltaSchema,
  ocupanteAltaSchema,
  personaExternaAltaSchema,
  titularAltaSchema,
  vehiculoAltaSchema,
} from './siniestros-alta.ts'

// Vehículos y personas desde la ficha (CU-10 1.c, E5-06), y abogados y peritos (1.d y 1.e, E5-07). Los datos se
// validan con los mismos schemas del alta: un vehículo con vehiculoAltaSchema; una persona según dónde está; un
// perito con peritoAltaSchema.

/** POST /api/siniestros/:id/personas. El titular y el ocupante dicen en qué vehículo; la persona fuera, no. */
export const agregarPersonaSchema = z.discriminatedUnion('tipo', [
  z.strictObject({ tipo: z.literal('titular'), idVehiculo: idSchema, datos: titularAltaSchema }),
  z.strictObject({ tipo: z.literal('ocupante'), idVehiculo: idSchema, datos: ocupanteAltaSchema }),
  z.strictObject({ tipo: z.literal('externa'), datos: personaExternaAltaSchema }),
])
export type AgregarPersona = z.output<typeof agregarPersonaSchema>
export type AgregarPersonaInput = z.input<typeof agregarPersonaSchema>

/** Cuántas veces se había modificado el registro cuando se abrió el formulario */
const revisionSchema = z.number().int().min(0)

/** PUT /api/siniestros/:id/vehiculos/:idVehiculo */
export const modificarVehiculoSchema = z.strictObject({
  revision: revisionSchema,
  datos: vehiculoAltaSchema,
})
export type ModificarVehiculo = z.output<typeof modificarVehiculoSchema>

/** PUT /api/siniestros/:id/personas/:idPersona. Los datos se validan según sea titular, ocupante o persona fuera. */
export const modificarPersonaSchema = z.strictObject({
  revision: revisionSchema,
  datos: z.unknown(),
})

/**
 * 409 al guardar un formulario abierto antes de que otro usuario modificara el mismo registro: no se guarda nada y
 * lo escrito sigue en el formulario. Trae la revisión actual: si después del aviso se guarda de nuevo, reemplaza.
 */
export type RegistroDesactualizado = { codigo: 'REGISTRO_DESACTUALIZADO'; revision: number }

/** Respuesta de agregar un vehículo o una persona */
export type ParteCreada = { id: number }

/** 409 al dar de baja un vehículo con titular u ocupantes (CU-10 1.c.6.1): a quiénes dar de baja primero */
export type VehiculoConPersonas = {
  codigo: 'VEHICULO_CON_PERSONAS'
  personas: { id: number; nombre: string | null; rol: 'titular' | 'ocupante' }[]
}

// ------------------------------------------------------------------ Abogados y peritos (CU-10 1.d y 1.e, E5-07)

/**
 * POST y PUT /api/siniestros/:id/abogados. El formulario del alta, pero representa a personas que ya existen: van
 * sus ids. Una persona que tenía otro abogado pasa a este.
 */
export const abogadoFichaSchema = abogadoAltaSchema.extend({
  representados: z
    .array(idSchema)
    .min(1, 'Elegí al menos una persona a la que representa')
    .max(100),
})
export type AbogadoFichaData = z.output<typeof abogadoFichaSchema>
export type AbogadoFichaInput = z.input<typeof abogadoFichaSchema>
