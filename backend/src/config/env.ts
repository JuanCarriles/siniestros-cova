import { z } from 'zod'

// Se validan al arrancar: si falta o está mal una variable, el servidor no levanta.
// R2 se valida de forma diferida en config/r2.ts cuando se usa el almacenamiento.
const textoOpcional = z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional())

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Vacías en el .env ("RESEND_API_KEY=") cuentan como no definidas: si no, el backend no arranca
  RESEND_API_KEY: textoOpcional,
  RESEND_FROM: textoOpcional,
  MAIL_FROM: textoOpcional,
  RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(15).default(5),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.url().default('http://localhost:5173'),
  // Cookie de sesión solo por HTTPS. Sin definir: true en producción, false en desarrollo.
  // Mientras el sitio se use por http (p. ej. http://IP-del-VPS:8080) tiene que ser false:
  // el navegador no envía cookies "secure" por http y el login no funcionaría.
  // "COOKIE_SECURE=" vacío en el .env cuenta como no definida
  COOKIE_SECURE: z.preprocess((v) => (v === '' ? undefined : v), z.stringbool().optional()),
  // RNF-08: la sesión vence tras estas horas sin actividad (cada pedido la renueva)
  SESSION_TTL_HOURS: z.coerce.number().positive().max(24).default(7),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('Variables de entorno inválidas:\n' + z.prettifyError(parsed.error))
  process.exit(1)
}

export const env = {
  ...parsed.data,
  COOKIE_SECURE: parsed.data.COOKIE_SECURE ?? parsed.data.NODE_ENV === 'production',
}
export const isProd = env.NODE_ENV === 'production'
