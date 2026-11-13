import type { Prisma } from '../../generated/prisma/client.ts'
import { carpetaNumerosR2 } from '../../lib/rutas-r2.ts'

type Tx = Pick<Prisma.TransactionClient, '$queryRaw' | 'siniestro'>
// Llamar dentro de una transacción. Bloqueo del caso primero, reserva de carpeta después.
// La ruta se conserva al editar los números: nunca se dividen los documentos existentes entre carpetas.
export async function asegurarCarpetaSiniestroR2(tx: Tx, id: number) {
  await tx.$queryRaw`SELECT "id" FROM "Siniestro" WHERE "id" = ${id} FOR UPDATE`
  const caso = await tx.siniestro.findUniqueOrThrow({
    where: { id },
    select: { id: true, numeroSiniestro: true, numeroPoliza: true, carpetaR2: true },
  })
  if (caso.carpetaR2) return caso.carpetaR2
  const base = carpetaNumerosR2(caso)
  await tx.$queryRaw`SELECT 1 AS bloqueado FROM pg_advisory_xact_lock(hashtextextended(${base}, 0))`
  const ocupada = await tx.siniestro.findUnique({
    where: { carpetaR2: base },
    select: { id: true },
  })
  const carpeta = ocupada && ocupada.id !== id ? `${base}/siniestro-${id}` : base
  await tx.siniestro.update({ where: { id }, data: { carpetaR2: carpeta } })
  return carpeta
}
