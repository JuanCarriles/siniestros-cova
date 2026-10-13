import { z } from 'zod'

// CU02 — Administrar Aseguradoras
export const aseguradoraSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'El nombre de la aseguradora es obligatorio')
    .max(100, 'El nombre no puede superar los 100 caracteres'),
})

export type AseguradoraInput = z.infer<typeof aseguradoraSchema>
