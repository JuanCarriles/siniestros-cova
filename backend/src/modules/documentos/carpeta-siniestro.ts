import type { Prisma } from '../../generated/prisma/client.ts'
import {
  carpetaConIdR2,
  carpetaNumerosR2,
  esCarpetaSiniestroAnteriorR2,
} from '../../lib/rutas-r2.ts'

type Tx = Pick<Prisma.TransactionClient, '$queryRaw' | 'siniestro'>

/**
 * La carpeta de R2 del siniestro: siniestros/{nºsiniestro}-{nºpóliza} (siniestro 1, póliza 1 → siniestros/1-1). Se
 * reserva en la base la primera vez y se conserva aunque después se editen los números, para no repartir los
 * documentos de un expediente entre dos carpetas. Si otro siniestro ya tiene esa carpeta, este lleva su id:
 * siniestros/1-1-id57.
 *
 * Llamar dentro de una transacción. Bloqueo del caso primero, reserva de carpeta después.
 * `reformatear`: solo la reorganización de archivos, que mueve los documentos de una carpeta con el formato
 * anterior (siniestros/{número}/{póliza}) a la nueva. Las cargas siguen usando la reservada hasta reorganizar.
 */
export async function asegurarCarpetaSiniestroR2(
  tx: Tx,
  id: number,
  { reformatear = false }: { reformatear?: boolean } = {},
) {
  await tx.$queryRaw`SELECT "id" FROM "Siniestro" WHERE "id" = ${id} FOR UPDATE`
  const caso = await tx.siniestro.findUniqueOrThrow({
    where: { id },
    select: { id: true, numeroSiniestro: true, numeroPoliza: true, carpetaR2: true },
  })
  if (caso.carpetaR2 && !(reformatear && esCarpetaSiniestroAnteriorR2(caso.carpetaR2)))
    return caso.carpetaR2
  const base = carpetaNumerosR2(caso)
  await tx.$queryRaw`SELECT 1 AS bloqueado FROM pg_advisory_xact_lock(hashtextextended(${base}, 0))`
  const ocupada = await tx.siniestro.findUnique({
    where: { carpetaR2: base },
    select: { id: true },
  })
  const carpeta = ocupada && ocupada.id !== id ? carpetaConIdR2(base, id) : base
  await tx.siniestro.update({ where: { id }, data: { carpetaR2: carpeta } })
  return carpeta
}
