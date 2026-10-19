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

// RF-05: contratos de las tres pantallas de recuperación. Nunca exponer el token al JavaScript.
export const solicitarRecuperacionSchema = z.strictObject({ email: emailSchema })
export const verificarCodigoSchema = z.strictObject({
  codigo: z.string().regex(/^\d{6}$/, 'Ingresá los 6 dígitos del código'),
})
export const nuevaContrasenaSchema = z
  .strictObject({
    contrasena: contrasenaSchema
      .min(8, 'Usá al menos 8 caracteres')
      .max(128, 'Usá hasta 128 caracteres'),
    confirmarContrasena: z.string().max(128),
  })
  .refine((datos) => datos.contrasena === datos.confirmarContrasena, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmarContrasena'],
  })
export type SolicitarRecuperacionData = z.output<typeof solicitarRecuperacionSchema>
export type NuevaContrasenaData = z.output<typeof nuevaContrasenaSchema>
