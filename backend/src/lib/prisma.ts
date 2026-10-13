import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.ts'

let client: PrismaClient | undefined

// Creacion diferida: los comandos de esquema y /health no necesitan una BD.
// Cliente sin filtros implicitos: los repositorios deben aplicar eliminado: false.
export function getPrisma(): PrismaClient {
  if (client) return client

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL es obligatoria para acceder a PostgreSQL')
  }

  const adapter = new PrismaPg({ connectionString })
  client = new PrismaClient({ adapter })
  return client
}

// Invocar durante el cierre ordenado cuando los modulos comiencen a usar la BD.
export async function disconnectPrisma(): Promise<void> {
  if (!client) return
  await client.$disconnect()
  client = undefined
}
