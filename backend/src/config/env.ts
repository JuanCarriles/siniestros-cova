import { z } from 'zod'

// Se validan al arrancar: si falta o está mal una variable, el servidor no levanta.
// Las variables de R2, Resend, etc. se agregan acá cuando se construya el módulo que las usa.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.url().default('http://localhost:5173'),
  // Cookie de sesión solo por HTTPS. Sin definir: true en producción, false en desarrollo.
  // Mientras el sitio se use por http (p. ej. http://IP-del-VPS:8080) tiene que ser false:
  // el navegador no envía cookies "secure" por http y el login no funcionaría.
  // "COOKIE_SECURE=" vacío en el .env cuenta como no definida
  COOKIE_SECURE: z.preprocess((v) => (v === '' ? undefined : v), z.stringbool().optional()),
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
