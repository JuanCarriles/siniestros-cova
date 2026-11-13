import { z } from 'zod'
import { datosCasoSchema } from './siniestros-alta.ts'
import { idSchema, opcional } from './comunes.ts'

// Se reutilizan las reglas de alta: límites de texto, fecha argentina y formatos de hora/lugar.
export const polizaEdicionSchema = z.strictObject({
  numeroSiniestro: datosCasoSchema.shape.numeroSiniestro,
  numeroPoliza: datosCasoSchema.shape.numeroPoliza,
  montoReclamado: datosCasoSchema.shape.montoReclamado,
  moneda: datosCasoSchema.shape.moneda,
  inicioVigencia: datosCasoSchema.shape.inicioVigencia,
  idAseguradora: datosCasoSchema.shape.idAseguradora,
  sucursal: datosCasoSchema.shape.sucursal,
})
export const hechoEdicionSchema = z
  .strictObject({
    fechaOcurrencia: datosCasoSchema.shape.fechaOcurrencia,
    horaOcurrencia: datosCasoSchema.shape.horaOcurrencia,
    menorEdadInvolucrado: datosCasoSchema.shape.menorEdadInvolucrado,
    causa: datosCasoSchema.shape.causa,
  })
  .refine((datos) => !datos.horaOcurrencia || datos.fechaOcurrencia, {
    message: 'Cargá también la fecha de ocurrencia',
    path: ['fechaOcurrencia'],
  })
export const asignacionEdicionSchema = z.strictObject({
  idAjustador: opcional(idSchema),
})
const comunes = {
  revision: z.number().int().min(0),
  hecho: hechoEdicionSchema,
  lugar: datosCasoSchema.shape.lugar,
}
export const editarCasoGestorSchema = z.strictObject(comunes)
export const editarCasoAdministradorSchema = z.strictObject({
  ...comunes,
  poliza: polizaEdicionSchema,
  asignacion: asignacionEdicionSchema,
})
export type EditarCasoGestor = z.output<typeof editarCasoGestorSchema>
export type EditarCasoAdministrador = z.output<typeof editarCasoAdministradorSchema>
export type DatosEdicionCaso = Pick<
  EditarCasoAdministrador,
  'poliza' | 'asignacion' | 'hecho' | 'lugar'
>
export type EdicionCaso = {
  revision: number
  datos: DatosEdicionCaso
  puedeEditarAsignacion: boolean
  opciones: {
    aseguradoras: { id: number; nombre: string; eliminado: boolean }[]
    ajustadores: { id: number; nombre: string; idAseguradora: number; eliminado: boolean }[]
    paises: { id: number; nombre: string; eliminado: boolean }[]
    provincias: { id: number; nombre: string; idPais: number; eliminado: boolean }[]
  }
}
export type ResultadoEdicionCaso = { modificado: boolean }
