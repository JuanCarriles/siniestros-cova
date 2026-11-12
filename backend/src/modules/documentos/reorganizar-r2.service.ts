import type { PrismaClient } from '../../generated/prisma/client.ts'
import type { AlmacenamientoR2 } from '../../lib/r2.ts'
import {
  conEntornoR2,
  exigirEntornoR2,
  carpetaNumerosR2,
  perteneceClaveSiniestroR2,
  type EntornoR2,
} from '../../lib/rutas-r2.ts'
import { asegurarCarpetaSiniestroR2 } from './carpeta-siniestro.ts'
import { HttpError } from '../../utils/httpError.ts'

type Cambio = {
  tipo: 'siniestro' | 'plantilla' | 'informe'
  id: string
  archivos: number
  carpeta: string
}
// Se copia, se comprueba el destino y recién después se cambian las referencias en la base.
// No se eliminan originales: las rutas antiguas pueden estar compartidas con otra base/entorno.
export async function reorganizarArchivosR2(deps: {
  db: PrismaClient
  r2: AlmacenamientoR2
  entorno: EntornoR2
  aplicar: boolean
  progreso?: (cambio: Cambio) => void
}) {
  const { db, r2, entorno, aplicar } = deps
  if (r2.entorno !== entorno)
    throw new HttpError(400, 'El entorno solicitado no coincide con R2_ENTORNO del servidor.')
  const cambios: Cambio[] = []
  const registrar = (c: Cambio) => {
    cambios.push(c)
    deps.progreso?.(c)
  }
  const planeadas = new Map<string, number>()
  // Las carpetas ya reservadas tienen prioridad, aunque su caso no tenga documentos.
  const reservadas = await db.siniestro.findMany({
    where: { carpetaR2: { not: null } },
    select: { id: true, carpetaR2: true },
  })
  reservadas.forEach((c) => planeadas.set(c.carpetaR2!, c.id))
  async function copiar(origen: string, carpeta: string) {
    exigirEntornoR2(origen, entorno)
    const destino = `${conEntornoR2(carpeta, entorno)}/${origen.split('/').pop()!}`
    if (origen === destino) return origen
    // HEAD también verifica los derivados; no se actualiza un registro si falta alguna copia.
    await r2.comprobarExistencia(origen)
    const copiado = await r2.copiar(origen, carpeta)
    if (copiado !== destino)
      throw new HttpError(503, 'El almacenamiento devolvió una ubicación inesperada.')
    await r2.comprobarExistencia(copiado)
    return copiado
  }
  let cursor = 0
  while (true) {
    const casos = await db.siniestro.findMany({
      where: { id: { gt: cursor }, documentos: { some: {} } },
      select: { id: true, numeroSiniestro: true, numeroPoliza: true, carpetaR2: true },
      orderBy: { id: 'asc' },
      take: 100,
    })
    if (!casos.length) break
    for (const caso of casos) {
      cursor = caso.id
      const base = carpetaNumerosR2(caso),
        ocupada = planeadas.get(base)
      const logica =
        caso.carpetaR2 ?? (ocupada && ocupada !== caso.id ? `${base}/siniestro-${caso.id}` : base)
      planeadas.set(logica, caso.id)
      const trabajo = async () => {
        const documentos = await db.documentoSiniestro.findMany({
          where: { idSiniestro: caso.id },
          select: { urlArchivoSinDominio: true, claveImagenOptimizada: true, claveMiniatura: true },
        })
        const claves = documentos.flatMap((d) =>
          [d.urlArchivoSinDominio, d.claveImagenOptimizada, d.claveMiniatura].filter(
            (k): k is string => !!k,
          ),
        )
        if (claves.some((k) => !perteneceClaveSiniestroR2(k, caso, entorno)))
          throw new HttpError(
            409,
            `El siniestro ${caso.id} tiene una clave ajena o de otro entorno. Revisalo antes de reorganizar.`,
          )
        const pendientes = claves.filter(
          (k) => k.slice(0, k.lastIndexOf('/')) !== conEntornoR2(logica, entorno),
        ).length
        if (!pendientes) return
        if (aplicar)
          await db.$transaction(
            async (tx) => {
              const carpeta = await asegurarCarpetaSiniestroR2(tx, caso.id)
              const actual = await tx.siniestro.findUniqueOrThrow({
                where: { id: caso.id },
                select: { eliminacionEnCurso: true },
              })
              if (actual.eliminacionEnCurso)
                throw new HttpError(409, `El siniestro ${caso.id} está en proceso de eliminación.`)
              const filas = await tx.documentoSiniestro.findMany({
                where: { idSiniestro: caso.id },
                orderBy: { id: 'asc' },
              })
              for (const d of filas) {
                for (const key of [
                  d.urlArchivoSinDominio,
                  d.claveImagenOptimizada,
                  d.claveMiniatura,
                ])
                  if (
                    key &&
                    !perteneceClaveSiniestroR2(key, { ...caso, carpetaR2: carpeta }, entorno)
                  )
                    throw new HttpError(
                      409,
                      'La ubicación del archivo cambió. Volvé a simular la reorganización.',
                    )
                const principal = await copiar(d.urlArchivoSinDominio, carpeta)
                const vista = d.claveImagenOptimizada
                  ? await copiar(d.claveImagenOptimizada, carpeta)
                  : null
                const miniatura = d.claveMiniatura ? await copiar(d.claveMiniatura, carpeta) : null
                await tx.documentoSiniestro.update({
                  where: { id: d.id },
                  data: {
                    urlArchivoSinDominio: principal,
                    claveImagenOptimizada: vista,
                    claveMiniatura: miniatura,
                  },
                })
              }
            },
            { timeout: 180000, maxWait: 10000 },
          )
        registrar({
          tipo: 'siniestro',
          id: String(caso.id),
          archivos: pendientes,
          carpeta: conEntornoR2(logica, entorno),
        })
      }
      await trabajo()
    }
  }
  const plantillas = await db.documentoPlantilla.findMany({
    select: { id: true, urlArchivo: true },
  })
  for (const p of plantillas) {
    exigirEntornoR2(p.urlArchivo, entorno)
    if (p.urlArchivo.startsWith(`${entorno}/plantillas/`)) continue
    if (!p.urlArchivo.startsWith('plantillas/'))
      throw new HttpError(409, `La plantilla ${p.id} tiene una ubicación inesperada.`)
    if (aplicar) {
      const clave = await copiar(p.urlArchivo, 'plantillas')
      await db.documentoPlantilla.updateMany({
        where: { id: p.id, urlArchivo: p.urlArchivo },
        data: { urlArchivo: clave },
      })
    }
    registrar({
      tipo: 'plantilla',
      id: String(p.id),
      archivos: 1,
      carpeta: `${entorno}/plantillas`,
    })
  }
  const informes = await db.informeMensual.findMany({
    where: { clavePdf: { not: null } },
    select: { id: true, clavePdf: true },
  })
  for (const i of informes) {
    const clave = i.clavePdf!
    exigirEntornoR2(clave, entorno)
    if (clave.startsWith(`${entorno}/informes mensuales/`)) continue
    if (!clave.startsWith('informes mensuales/'))
      throw new HttpError(409, `El informe ${i.id} tiene una ubicación inesperada.`)
    const carpeta = clave.slice(0, clave.lastIndexOf('/'))
    if (aplicar) {
      const nueva = await copiar(clave, carpeta)
      await db.informeMensual.updateMany({
        where: { id: i.id, clavePdf: clave },
        data: { clavePdf: nueva },
      })
    }
    registrar({ tipo: 'informe', id: i.id, archivos: 1, carpeta: conEntornoR2(carpeta, entorno) })
  }
  return {
    aplicado: aplicar,
    registros: cambios.length,
    archivos: cambios.reduce((n, c) => n + c.archivos, 0),
  }
}
