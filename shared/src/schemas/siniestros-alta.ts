import { z } from 'zod'
import { booleanoSchema, fechaSchema, horaSchema, idSchema, opcional } from './comunes.ts'

// ------------------------------------------------------------------ Alta de siniestro (CU-09 pasos 4-5, E4-04)

/** Pasos del alta, en el orden del CU-09. Cada historia habilita el suyo. */
export const PASOS_ALTA = [
  'Datos del caso',
  'Vehículos y personas',
  'Abogados',
  'Peritos',
  'Documentos y asignación',
] as const

/** Hoy en Argentina, como AAAA-MM-DD: el navegador y el servidor comparan contra el mismo día. */
export function hoyArgentina(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    ahora,
  )
}

const obligatorio = (mensaje: string, max: number) =>
  z.string({ error: mensaje }).trim().min(1, mensaje).max(max, `Usá como máximo ${max} caracteres`)
const libre = (max: number) =>
  opcional(z.string().trim().min(1).max(max, `Usá como máximo ${max} caracteres`))
// Las listas desplegables mandan '' cuando no se eligió nada: ese caso tiene su propio mensaje.
const elegido = (mensaje: string) =>
  z.union([z.number(), z.string().trim().min(1, mensaje)], { error: mensaje }).pipe(idSchema)

// Paso 1: datos del caso. Solo número, póliza, aseguradora y sucursal son obligatorios (CU-09 5.a); el resto se
// carga si se conoce. El país solo filtra provincias en el formulario: la dirección guarda la provincia.
export const datosCasoSchema = z
  .strictObject({
    numeroSiniestro: obligatorio('Ingresá el número de siniestro', 60),
    numeroPoliza: obligatorio('Ingresá el número de póliza', 60),
    inicioVigencia: libre(60),
    idAseguradora: elegido('Elegí la aseguradora'),
    sucursal: obligatorio('Ingresá la sucursal de emisión', 100),
    idAjustador: opcional(idSchema),
    fechaOcurrencia: opcional(
      fechaSchema.refine(
        (fecha) => fecha <= hoyArgentina(),
        'La fecha no puede ser posterior a hoy',
      ),
    ),
    horaOcurrencia: opcional(horaSchema),
    menorEdadInvolucrado: booleanoSchema,
    causa: libre(2000),
    lugar: z.strictObject({
      idProvincia: opcional(idSchema),
      localidad: libre(100),
      calle: libre(150),
      codigoPostal: libre(20),
    }),
  })
  .refine((datos) => !datos.horaOcurrencia || datos.fechaOcurrencia, {
    message: 'Cargá también la fecha de ocurrencia',
    path: ['fechaOcurrencia'],
  })

export type DatosCasoInput = z.input<typeof datosCasoSchema>
export type DatosCasoData = z.output<typeof datosCasoSchema>

/** Lo que necesita el formulario del paso 1: solo aseguradoras, ajustadores y provincias activos. */
export type OpcionesAltaSiniestro = {
  aseguradoras: { id: number; nombre: string }[]
  ajustadores: { id: number; nombre: string; idAseguradora: number; casosActivos: number }[]
  paises: { id: number; nombre: string }[]
  provincias: { id: number; nombre: string; idPais: number }[]
}
