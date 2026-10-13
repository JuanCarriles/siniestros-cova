import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'prisma/config'

// Ruta relativa a este archivo: funciona tambien desde la raiz del monorepo.
// Las variables del entorno (p. ej. Docker) tienen prioridad sobre .env.
const envPath = fileURLToPath(new URL('./.env', import.meta.url))
if (existsSync(envPath)) loadEnvFile(envPath)

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // No se necesita una conexion para format, validate ni generate.
  // Los comandos de migracion requieren DATABASE_URL configurada explicitamente.
  datasource: { url: process.env.DATABASE_URL },
})
