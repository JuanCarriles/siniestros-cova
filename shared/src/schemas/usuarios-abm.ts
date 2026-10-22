import { z } from 'zod'
import { contrasenaNuevaSchema } from './auth.ts'
import { documentoSchema, emailSchema, idSchema, telefonoSchema, textoSchema } from './comunes.ts'
import { direccionSchema } from './direcciones.ts'
import { tipoUsuarioSchema, type TipoUsuario } from './enums.ts'

// CU-04: la jerarquía se comparte con la interfaz y se comprueba de nuevo en el servidor.
export function tiposUsuarioAdministrables(tipo: TipoUsuario): TipoUsuario[] {
  if (tipo === 'SUPER_ADMINISTRADOR') return ['GESTOR', 'ADMINISTRADOR']
  if (tipo === 'ADMINISTRADOR') return ['GESTOR']
  return []
}

const datosUsuarioSchema = z.strictObject({
  nombres: textoSchema.max(60),
  apellidos: textoSchema.max(60),
  documento: documentoSchema.max(30),
  telefono: telefonoSchema.max(30),
  email: emailSchema.pipe(z.string().max(120)).transform((email) => email.toLowerCase()),
  tipoUsuario: tipoUsuarioSchema,
  direccion: direccionSchema.extend({ idProvincia: idSchema }),
})

export const usuarioAltaSchema = datosUsuarioSchema.extend({ contrasena: contrasenaNuevaSchema })
// La cadena vacía significa conservar el hash actual. Nunca se guarda como contraseña.
export const usuarioModificacionSchema = datosUsuarioSchema
  .extend({ contrasena: z.union([z.literal(''), contrasenaNuevaSchema]).optional() })
  .partial()
  .refine(
    (datos) =>
      Object.entries(datos).some(
        ([campo, valor]) => valor !== undefined && !(campo === 'contrasena' && valor === ''),
      ),
    'Enviá al menos un campo para modificar',
  )

export const usuarioFormularioSchema = datosUsuarioSchema.extend({
  contrasena: z.union([z.literal(''), contrasenaNuevaSchema]),
})
export type UsuarioAltaData = z.output<typeof usuarioAltaSchema>
export type UsuarioModificacionData = z.output<typeof usuarioModificacionSchema>
export type UsuarioFormularioInput = z.input<typeof usuarioFormularioSchema>
export type UsuarioFormularioData = z.output<typeof usuarioFormularioSchema>

export const usuarioListadoSchema = z.object({
  id: idSchema,
  nombres: textoSchema,
  apellidos: textoSchema,
  documento: textoSchema,
  email: emailSchema,
  telefono: textoSchema,
  tipoUsuario: tipoUsuarioSchema,
  casosActivos: z.number().int().nonnegative(),
  eliminado: z.boolean(),
  fechaBaja: z.iso.datetime({ offset: true }).nullable(),
  direccion: z.object({
    localidad: z.string().nullable(),
    calle: z.string().nullable(),
    pisoDepartamento: z.string().nullable(),
    codigoPostal: z.string().nullable(),
    idProvincia: idSchema.nullable(),
    provincia: z
      .object({
        id: idSchema,
        nombre: textoSchema,
        idPais: idSchema,
        pais: z.object({ id: idSchema, nombre: textoSchema }),
      })
      .nullable(),
  }),
})
export type UsuarioListado = z.output<typeof usuarioListadoSchema>

export const catalogosUsuariosSchema = z.object({
  paises: z.array(z.object({ id: idSchema, nombre: textoSchema })),
  provincias: z.array(z.object({ id: idSchema, nombre: textoSchema, idPais: idSchema })),
})
export type CatalogosUsuarios = z.output<typeof catalogosUsuariosSchema>

export const bloqueoBajaUsuarioSchema = z.object({
  codigo: z.literal('USUARIO_CON_SINIESTROS'),
  casosActivos: z.number().int().positive(),
})
