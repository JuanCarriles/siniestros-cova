import { z } from 'zod'
import { enteroPequenoSchema, esquemaEdicion, idSchema, opcional, textoSchema } from './comunes.ts'
import { rolAccidenteSchema, usoVehiculoSchema } from './enums.ts'

// Datos de alta de Vehiculo; id y baja lógica se gestionan por separado.
export const vehiculoSchema = z.strictObject({
  dominio: textoSchema,
  marca: opcional(textoSchema),
  modelo: opcional(textoSchema),
  version: opcional(textoSchema),
  acreedorPrendario: opcional(textoSchema),
  numeroChasis: opcional(textoSchema),
  anio: opcional(enteroPequenoSchema),
  numeroMotor: opcional(textoSchema),
  tipo: opcional(textoSchema),
  descripcionDanos: opcional(textoSchema),
  color: opcional(textoSchema),
  idAseguradora: opcional(idSchema),
  rolAccidente: opcional(rolAccidenteSchema),
  uso: opcional(usoVehiculoSchema),
})

export const vehiculoUpdateSchema = esquemaEdicion(vehiculoSchema)

export type VehiculoInput = z.input<typeof vehiculoSchema>
export type VehiculoData = z.output<typeof vehiculoSchema>
export type VehiculoUpdateInput = z.input<typeof vehiculoUpdateSchema>
export type VehiculoUpdateData = z.output<typeof vehiculoUpdateSchema>
