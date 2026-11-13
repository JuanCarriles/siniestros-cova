import type { Prisma } from '../../generated/prisma/client.ts'
import { limitesMes, type Registro, type ContextoInforme } from './informes.calculos.ts'

/** Una foto previa por caso y los cambios del período. El contexto escalar conserva la primera respuesta
 * tras una asignación anterior al mes, sin transportar todas las fotos históricas a Node. */
export async function cargarRegistrosInforme(
  tx: Prisma.TransactionClient,
  periodo: string,
  ahora: Date,
) {
  const { inicio, fin } = limitesMes(periodo)
  const corte = new Date(Math.min(fin.getTime(), ahora.getTime()))
  const [anteriores, delMes, cobertura, asignaciones] = await Promise.all([
    tx.$queryRaw<Registro[]>`
      SELECT DISTINCT ON ("idSiniestro") id,"idSiniestro","fechaRegistro","fechaEvento",evento,"idAutor",datos
      FROM "RegistroEstadisticoSiniestro" WHERE "idSiniestro">0 AND "fechaRegistro"<${inicio}
      ORDER BY "idSiniestro","fechaRegistro" DESC,id DESC`,
    tx.registroEstadisticoSiniestro.findMany({
      where: { fechaRegistro: { gte: inicio, lt: corte } },
      orderBy: [{ fechaRegistro: 'asc' }, { id: 'asc' }],
    }),
    tx.registroEstadisticoSiniestro.findFirst({
      where: { evento: 'INICIO', fechaRegistro: { lt: corte } },
      orderBy: [{ fechaRegistro: 'asc' }, { id: 'asc' }],
    }),
    tx.$queryRaw<{ idSiniestro: number; desde: Date; respondida: boolean }[]>`
      WITH cambios AS (
        SELECT id,"idSiniestro","fechaRegistro",datos->'gestor'->>'id' AS gestor,
          LAG(datos->'gestor'->>'id') OVER w AS anterior,
          CASE WHEN LAG(id) OVER w IS NULL THEN (datos->>'ingreso')::timestamptz ELSE "fechaRegistro" END AS desde
        FROM "RegistroEstadisticoSiniestro" WHERE "idSiniestro">0 AND "fechaRegistro"<${inicio}
        WINDOW w AS (PARTITION BY "idSiniestro" ORDER BY "fechaRegistro",id)
      ), ultimas AS (
        SELECT DISTINCT ON ("idSiniestro") * FROM cambios WHERE gestor IS DISTINCT FROM anterior
        ORDER BY "idSiniestro","fechaRegistro" DESC,id DESC
      )
      SELECT a."idSiniestro",a.desde,EXISTS (
        SELECT 1 FROM "RegistroEstadisticoSiniestro" n WHERE n."idSiniestro"=a."idSiniestro" AND n.evento='NOVEDAD'
        AND (n."fechaRegistro",n.id)>=(a."fechaRegistro",a.id) AND n."fechaRegistro"<${inicio} AND n."fechaEvento">=a.desde
      ) AS respondida FROM ultimas a`,
  ])
  const contexto: ContextoInforme = {
    asignaciones: new Map(
      asignaciones.map((a) => [
        a.idSiniestro,
        { desde: a.desde.toISOString(), respondida: a.respondida },
      ]),
    ),
  }
  // Sin INICIO (p. ej. datos importados), conservar la misma cobertura que la consulta completa.
  const inicioCobertura =
    cobertura ??
    (await tx.registroEstadisticoSiniestro.findFirst({
      where: { fechaRegistro: { lt: corte } },
      orderBy: [{ fechaRegistro: 'asc' }, { id: 'asc' }],
    }))
  const registros: Registro[] = [...anteriores, ...delMes]
  if (inicioCobertura && !registros.some((r) => r.id === inicioCobertura.id))
    registros.push({ ...inicioCobertura, idSiniestro: 0, evento: 'INICIO', datos: {} })
  return { registros, contexto }
}
