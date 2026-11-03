import { z } from 'zod'
import { idSchema } from './comunes.ts'
import type { TipoUsuario } from './enums.ts'

// CU-10 4.b: el responsable que se confirmó debe seguir siendo el actual al guardar.
export const reasignarSiniestroSchema = z.strictObject({
  idUsuarioAnterior: idSchema.nullable(),
  idUsuarioNuevo: idSchema,
  confirmado: z.literal(true, { error: 'Confirmá la reasignación antes de continuar.' }),
})
export type ReasignarSiniestro = z.output<typeof reasignarSiniestroSchema>
export type OpcionesReasignacion = {
  anterior: { id: number; nombre: string } | null
  usuarios: { id: number; nombre: string; tipoUsuario: TipoUsuario; casosActivos: number }[]
}
export type ResultadoReasignacion = { correosEnviados: boolean }
