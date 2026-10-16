import { z } from 'zod'
import { contrasenaSchema, emailSchema, idSchema, textoSchema } from './comunes.ts'
import { tipoUsuarioSchema } from './enums.ts'

// CU-01: datos del formulario de inicio de sesión (frontend) y del POST /api/auth/login (backend).
export const loginSchema = z.strictObject({
  email: emailSchema,
  contrasena: contrasenaSchema,
})

export type LoginInput = z.input<typeof loginSchema>
export type LoginData = z.output<typeof loginSchema>

// Lo único que el frontend recibe del usuario con sesión iniciada: nunca el hash ni datos de más.
export const sesionUsuarioSchema = z.object({
  id: idSchema,
  nombres: textoSchema,
  apellidos: textoSchema,
  email: emailSchema,
  tipoUsuario: tipoUsuarioSchema,
})

export type SesionUsuario = z.output<typeof sesionUsuarioSchema>
