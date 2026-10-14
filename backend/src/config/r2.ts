import { z } from 'zod'

const opcional = (value: unknown) => value === '' ? undefined : value

const configuracionR2Schema = z.object({
  R2_ACCOUNT_ID: z.string().trim().regex(/^[a-f0-9]{32}$/i),
  R2_ACCESS_KEY_ID: z.string().trim().min(1),
  R2_SECRET_ACCESS_KEY: z.string().trim().min(1),
  R2_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  R2_ENDPOINT: z.preprocess(opcional, z.url().optional()),
  R2_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(1).max(300).default(60),
  UPLOAD_MAX_MB: z.coerce.number().int().min(1).max(100).default(10),
  UPLOAD_ALLOWED_EXT: z.string().default('pdf,jpg,jpeg,png,docx,xlsx')
    .transform(value => value.split(',').map(ext => ext.trim().toLowerCase()))
    .pipe(z.array(z.enum(['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx'])).min(1)),
}).superRefine((config, ctx) => {
  if (!config.R2_ENDPOINT) return
  const hosts = ['', '.eu', '.fedramp'].map(jurisdiccion =>
    `https://${config.R2_ACCOUNT_ID}${jurisdiccion}.r2.cloudflarestorage.com`)
  if (!hosts.includes(config.R2_ENDPOINT.replace(/\/$/, ''))) {
    ctx.addIssue({ code: 'custom', path: ['R2_ENDPOINT'], message: 'Endpoint S3 de R2 inválido para esta cuenta' })
  }
})

export type ConfiguracionR2 = z.output<typeof configuracionR2Schema>

// Validación diferida: typecheck, Prisma generate y /health no necesitan credenciales.
export function leerConfiguracionR2(variables: NodeJS.ProcessEnv = process.env): ConfiguracionR2 {
  const resultado = configuracionR2Schema.safeParse(variables)
  if (!resultado.success) {
    const campos = [...new Set(resultado.error.issues.map(issue => issue.path.join('.')))]
    // Nunca imprimir el entorno, inputs de Zod ni valores de las credenciales.
    throw new Error(`Configuración R2 inválida. Revisá en backend/.env: ${campos.join(', ')}`)
  }
  return resultado.data
}
