import { z } from 'zod'

/** Largo máximo del texto de una novedad: el formulario muestra cuántos caracteres quedan */
export const MAXIMO_NOVEDAD = 4000

const mensaje = 'Escribí la novedad antes de cargarla'

// CU-10 1.f.1 (E5-08): el texto de la novedad. Lo mismo valida el formulario y el servidor.
/** POST /api/siniestros/:id/novedades */
export const novedadSchema = z.strictObject({
  descripcion: z
    .string({ error: mensaje })
    .trim()
    .min(1, mensaje)
    .max(MAXIMO_NOVEDAD, `Usá como máximo ${MAXIMO_NOVEDAD} caracteres`),
})
export type NovedadData = z.output<typeof novedadSchema>
export type NovedadInput = z.input<typeof novedadSchema>
