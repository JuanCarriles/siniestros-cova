import { z } from 'zod'
import {
  booleanoSchema,
  esquemaEdicion,
  fechaHoraSchema,
  fechaSchema,
  horaSchema,
  idSchema,
  opcional,
  textoSchema,
} from './comunes.ts'

// Datos de alta de Siniestro; id y baja lógica se gestionan por separado.
export const siniestroSchema = z.strictObject({
  numeroSiniestro: textoSchema,
  numeroPoliza: textoSchema,
  fechaAsignacion: fechaHoraSchema,
  demorado: booleanoSchema,
  menorEdadInvolucrado: booleanoSchema,
  idEstadoSiniestro: idSchema,
  idAseguradora: idSchema,
  idUsuario: idSchema,
  fechaOcurrencia: opcional(fechaSchema),
  horaOcurrencia: opcional(horaSchema),
  inicioVigencia: opcional(textoSchema),
  sucursal: opcional(textoSchema),
  causa: opcional(textoSchema),
  fechaCierre: opcional(fechaHoraSchema),
  fechaUltimoMovimiento: opcional(fechaHoraSchema),
  idAjustador: opcional(idSchema),
  idDireccion: opcional(idSchema),
})

export const siniestroUpdateSchema = esquemaEdicion(siniestroSchema)

export type SiniestroInput = z.input<typeof siniestroSchema>
export type SiniestroData = z.output<typeof siniestroSchema>
export type SiniestroUpdateInput = z.input<typeof siniestroUpdateSchema>
export type SiniestroUpdateData = z.output<typeof siniestroUpdateSchema>
