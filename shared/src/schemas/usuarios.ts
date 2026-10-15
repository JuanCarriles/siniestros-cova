import { z } from 'zod'
import {
  contrasenaSchema,
  documentoSchema,
  emailSchema,
  esquemaEdicion,
  fechaHoraSchema,
  idSchema,
  opcional,
  telefonoSchema,
  textoSchema,
} from './comunes.ts'
import { tipoUsuarioSchema } from './enums.ts'

// Datos de alta de Usuario; id y baja lógica se gestionan por separado.
export const usuarioSchema = z.strictObject({
  nombres: textoSchema,
  apellidos: textoSchema,
  documento: documentoSchema,
  telefono: telefonoSchema,
  email: emailSchema,
  contrasena: contrasenaSchema,
  tipoUsuario: tipoUsuarioSchema,
  idDireccion: idSchema,
  ultimaConexion: opcional(fechaHoraSchema),
})

export const usuarioUpdateSchema = esquemaEdicion(usuarioSchema)

export type UsuarioInput = z.input<typeof usuarioSchema>
export type UsuarioData = z.output<typeof usuarioSchema>
export type UsuarioUpdateInput = z.input<typeof usuarioUpdateSchema>
export type UsuarioUpdateData = z.output<typeof usuarioUpdateSchema>
