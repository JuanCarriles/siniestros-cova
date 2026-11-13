import { z } from 'zod'

// Se transporta texto decimal exacto. Sin dato es null, nunca cero implícito.
export const importeSchema = z
  .union([
    z.string(),
    z
      .number()
      .finite()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER / 100)
      .transform(String),
  ])
  .transform((v) => v.trim().replace(',', '.'))
  .pipe(
    z
      .string()
      .regex(/^\d{1,14}(?:\.\d{1,2})?$/, 'Ingresá un importe positivo con hasta dos decimales'),
  )
export const importeOpcionalSchema = z.preprocess(
  (v) => (v === '' ? null : v),
  importeSchema.nullable().optional(),
)
export const monedaSchema = z.enum(['ARS', 'USD'])
export const RESULTADOS_CIERRE = {
  ACUERDO_PAGO: 'Acuerdo / pago',
  RECHAZO: 'Rechazo',
  DESISTIMIENTO: 'Desistimiento del tercero',
  DERIVACION_JUICIO: 'Derivación a juicio',
} as const
export const cierreInformeSchema = z
  .strictObject({
    resultadoCierre: z.enum(['ACUERDO_PAGO', 'RECHAZO', 'DESISTIMIENTO', 'DERIVACION_JUICIO'], {
      error: 'Elegí el resultado del cierre',
    }),
    montoAcordado: importeOpcionalSchema,
  })
  .refine((v) => v.resultadoCierre !== 'ACUERDO_PAGO' || v.montoAcordado != null, {
    path: ['montoAcordado'],
    message: 'Ingresá el monto acordado; si no hubo importe, indicá 0',
  })
export const periodoInformeSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Elegí un mes válido')
  .refine(
    (v) => Number(v.slice(0, 4)) >= 2000 && Number(v.slice(0, 4)) <= 2100,
    'Elegí un año entre 2000 y 2100',
  )
export const generarInformeSchema = z.strictObject({
  periodo: periodoInformeSchema,
  enviarCorreo: z.boolean().default(false),
})
export const informeListadoSchema = z.strictObject({
  id: z.uuid(),
  periodo: periodoInformeSchema,
  prueba: z.boolean(),
  estado: z.string(),
  fechaCreacion: z.string(),
  disponible: z.boolean(),
  correoEnviado: z.string().nullable(),
  error: z.string().nullable(),
  proximoIntento: z.string().nullable(),
  destinatarios: z.array(z.strictObject({ email: z.email(), enviadoEn: z.string() })),
})
export const listadoInformesSchema = z.strictObject({
  informes: z.array(informeListadoSchema),
  pruebasHabilitadas: z.boolean(),
  total: z.number().int().nonnegative(),
  pagina: z.number(),
  paginas: z.number(),
})
export type InformeListado = z.output<typeof informeListadoSchema>
