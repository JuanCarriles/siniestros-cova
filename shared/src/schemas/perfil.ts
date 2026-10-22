import { z } from 'zod'
import { nuevaContrasenaSchema } from './auth.ts'
import { contrasenaSchema, idSchema, textoSchema } from './comunes.ts'
import { usuarioFormularioSchema, usuarioListadoSchema } from './usuarios-abm.ts'

// Lista blanca del perfil propio: no acepta id, rol, estado, fecha de baja ni contadores.
export const perfilDatosSchema = usuarioFormularioSchema.omit({
  tipoUsuario: true,
  contrasena: true,
})
export const perfilVerificarSchema = z.strictObject({
  contrasena: contrasenaSchema.max(128),
})
export const perfilActualizacionSchema = perfilDatosSchema.extend({
  contrasenaActual: perfilVerificarSchema.shape.contrasena,
})
export const perfilContrasenaSchema = nuevaContrasenaSchema.safeExtend({
  contrasenaActual: perfilVerificarSchema.shape.contrasena,
})
export type PerfilActualizacionData = z.output<typeof perfilActualizacionSchema>
export type PerfilContrasenaData = z.output<typeof perfilContrasenaSchema>
export const perfilContrasenaRespuestaSchema = z.strictObject({ correoEnviado: z.boolean() })
export type PerfilContrasenaRespuesta = z.output<typeof perfilContrasenaRespuestaSchema>
export type PerfilDatosInput = z.input<typeof perfilDatosSchema>
export type PerfilDatosData = z.output<typeof perfilDatosSchema>
export type PerfilVerificarData = z.output<typeof perfilVerificarSchema>
export type AlcancePerfil = 'datos' | 'contrasena'

export const perfilSchema = usuarioListadoSchema.extend({
  ultimaConexion: z.iso.datetime({ offset: true }).nullable(),
  casosDemorados: z.number().int().nonnegative(),
  demorados: z.array(
    z.object({
      id: idSchema,
      numeroSiniestro: textoSchema,
      aseguradora: textoSchema,
      diasSinMovimiento: z.number().int().nonnegative(),
    }),
  ),
})
export type Perfil = z.output<typeof perfilSchema>
