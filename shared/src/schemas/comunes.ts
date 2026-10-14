import { z } from 'zod'

// Sólo enteros decimales explícitos: Number(''), Number(null) y booleanos no son entradas válidas.
const enteroEntradaSchema = z.union([
  z.number(),
  z.string().trim().regex(/^-?\d+$/, 'Ingresá un número entero').transform(Number),
])

export const enteroSchema = enteroEntradaSchema.pipe(
  z.number().int('Ingresá un número entero').min(-2147483648).max(2147483647),
)

export const enteroPequenoSchema = enteroEntradaSchema.pipe(
  z.number().int('Ingresá un número entero').min(-32768).max(32767),
)

export const idSchema = enteroEntradaSchema.pipe(
  z.number().int('El identificador debe ser entero').positive('Seleccioná un registro válido').max(2147483647),
)

export const textoSchema = z.string({ error: 'Ingresá un texto' })
  .trim().min(1, 'Este campo es obligatorio')

export const emailSchema = textoSchema.pipe(z.email({ error: 'Ingresá un email válido' }))

// No se limita a DNI argentino, patentes locales ni teléfonos E.164: Prisma no define esas reglas.
export const telefonoSchema = textoSchema
export const documentoSchema = textoSchema

// No modificar ni recortar una contraseña. La política de fortaleza se define en autenticación.
export const contrasenaSchema = z.string({ error: 'Ingresá una contraseña' })
  .min(1, 'La contraseña es obligatoria')
  .refine(value => value.trim().length > 0, 'La contraseña no puede contener sólo espacios')

// Acepta exclusivamente booleanos, nunca convierte el texto "false" en true.
export const booleanoSchema = z.boolean({ error: 'Seleccioná verdadero o falso' })

// Se conservan como texto ISO para formularios y JSON. Convertir explícitamente a Date en el backend.
export const fechaSchema = z.iso.date({ error: 'Ingresá una fecha válida (AAAA-MM-DD)' })
export const horaSchema = z.iso.time({ error: 'Ingresá una hora válida (HH:mm o HH:mm:ss)' })
export const fechaHoraSchema = z.iso.datetime({ offset: true, error: 'Ingresá fecha y hora con zona horaria' })

export const urlArchivoSchema = textoSchema.pipe(
  z.url({ protocol: /^https?$/, error: 'Ingresá una URL HTTP o HTTPS válida' }),
)

// Es una clave de almacenamiento, no una URL pública. Las rutas se generan y autorizan en el backend.
export const claveArchivoSchema = z.string().min(1).max(1024)
  .regex(/^[a-zA-Z0-9._/-]+$/, 'Ingresá una clave de archivo, sin dominio ni parámetros')
  .refine(value => value.split('/').every(segmento => segmento !== '' && segmento !== '.' && segmento !== '..'),
    'La clave debe ser una ruta relativa sin segmentos vacíos, . ni ..')
export const extensionArchivoSchema = textoSchema
export const mimeTypeSchema = textoSchema

// JSON no soporta bigint: la salida es texto decimal exacto, convertible a BigInt en el backend.
export const tamanoBytesSchema = z.union([
  z.bigint(),
  z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).transform(BigInt),
  z.string().trim().regex(/^\d+$/, 'Ingresá un tamaño entero en bytes').transform(BigInt),
]).pipe(z.bigint().min(0n).max(9223372036854775807n))
  .transform(value => value.toString())

// undefined = no enviado; null o campo vacío = borrar un valor nullable.
// No convertir campos vacíos en cero, false ni fechas inesperadas.
export function opcional<T extends z.ZodType>(schema: T) {
  return z.union([
    schema,
    z.string().trim().length(0).transform(() => null),
  ]).nullable().optional()
}

export function esquemaEdicion<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.partial().refine(
    values => Object.values(values).some(value => value !== undefined),
    'Enviá al menos un campo para modificar',
  )
}

// Sólo para operaciones de baja/restauración autorizadas; nunca mezclar con un formulario general.
export const bajaLogicaSchema = z.discriminatedUnion('eliminado', [
  z.strictObject({ eliminado: z.literal(false), fechaBaja: z.null() }),
  z.strictObject({ eliminado: z.literal(true), fechaBaja: fechaHoraSchema }),
])

export type BajaLogicaInput = z.input<typeof bajaLogicaSchema>
