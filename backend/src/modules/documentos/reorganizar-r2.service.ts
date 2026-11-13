import type { PrismaClient } from '../../generated/prisma/client.ts'
import type { AlmacenamientoR2 } from '../../lib/r2.ts'
import {
  carpetaConIdR2,
  carpetaNumerosR2,
  claveInformeR2,
  conEntornoR2,
  esCarpetaSiniestroAnteriorR2,
  exigirEntornoR2,
  nombreLegibleR2,
  perteneceClaveSiniestroR2,
  type EntornoR2,
} from '../../lib/rutas-r2.ts'
import { asegurarCarpetaSiniestroR2 } from './carpeta-siniestro.ts'
import { HttpError } from '../../utils/httpError.ts'

// Lleva los archivos de R2 a la organización actual (docs/ORGANIZACION_R2.md):
//   - documentos de cada siniestro a {entorno}/siniestros/{nºsiniestro}-{nºpóliza}/, con nombre legible;
//   - plantillas a {entorno}/plantillas/, con nombre legible;
//   - informes a {entorno}/informes/{AAAA}/{AAAA-MM}-{código}.pdf.
// Se copia, se comprueba el destino y recién después se cambian las referencias en la base, siniestro por siniestro
// y con el mismo bloqueo que la carga. No se borra nada: lo anterior queda en el informe de sobrantes, para
// retirarlo a mano después de verificar. Un reintento usa los mismos nombres de destino (no duplica).

type Cambio = {
  tipo: 'siniestro' | 'plantilla' | 'informe' | 'carpeta' | 'omitido'
  id: string
  archivos: number
  carpeta: string
  motivo?: string
}

export type Sobrante = { clave: string; bytes: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const nombreDe = (clave: string) => clave.slice(clave.lastIndexOf('/') + 1)
const carpetaDe = (clave: string) => clave.slice(0, clave.lastIndexOf('/'))
const extensionDe = (clave: string) => nombreDe(clave).split('.').pop()!.toLowerCase()
/** Para que un reintento llegue al mismo nombre: el código sale del nombre anterior (su UUID, si lo tenía) */
const codigoDe = (clave: string) =>
  UUID.test(nombreDe(clave))
    ? nombreDe(clave).slice(0, 8).toLowerCase()
    : nombreDe(clave)
        .replace(/[^a-z0-9]/gi, '')
        .slice(-8)
        .toLowerCase()

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

  async function copiar(origen: string, carpeta: string, nombre: string) {
    exigirEntornoR2(origen, entorno)
    const destino = `${conEntornoR2(carpeta, entorno)}/${nombre}`
    if (origen === destino) return origen
    // HEAD también verifica los derivados; no se actualiza un registro si falta alguna copia.
    await r2.comprobarExistencia(origen)
    const copiado = await r2.copiar(origen, carpeta, nombre)
    if (copiado !== destino)
      throw new HttpError(503, 'El almacenamiento devolvió una ubicación inesperada.')
    await r2.comprobarExistencia(copiado)
    return copiado
  }

  // --- Siniestros: carpeta {nºsiniestro}-{nºpóliza} y nombres legibles
  // Las carpetas ya reservadas con el formato nuevo tienen prioridad, aunque su caso no tenga documentos.
  const planeadas = new Map<string, number>()
  for (const c of await db.siniestro.findMany({
    where: { carpetaR2: { not: null } },
    select: { id: true, carpetaR2: true },
  }))
    if (!esCarpetaSiniestroAnteriorR2(c.carpetaR2!)) planeadas.set(c.carpetaR2!, c.id)

  type Doc = {
    id: number
    nombreOriginal: string
    urlArchivoSinDominio: string
    claveImagenOptimizada: string | null
    claveMiniatura: string | null
  }
  /** Dónde va cada clave del documento: el principal con nombre legible; sus derivados, con el mismo nombre */
  function destinos(d: Doc, carpeta: string) {
    const principal = d.urlArchivoSinDominio
    const yaLegible =
      carpetaDe(principal) === conEntornoR2(carpeta, entorno) && !UUID.test(nombreDe(principal))
    const nuevo = yaLegible
      ? nombreDe(principal)
      : nombreLegibleR2(d.nombreOriginal, extensionDe(principal), codigoDe(principal))
    const derivado = (clave: string | null) =>
      clave === null
        ? null
        : clave.startsWith(principal)
          ? nuevo + clave.slice(principal.length)
          : nombreDe(clave)
    return {
      principal: nuevo,
      vista: derivado(d.claveImagenOptimizada),
      miniatura: derivado(d.claveMiniatura),
    }
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
      const actual =
        caso.carpetaR2 && !esCarpetaSiniestroAnteriorR2(caso.carpetaR2) ? caso.carpetaR2 : null
      const base = carpetaNumerosR2(caso)
      const ocupada = planeadas.get(base)
      const logica =
        actual ??
        (ocupada !== undefined && ocupada !== caso.id ? carpetaConIdR2(base, caso.id) : base)
      planeadas.set(logica, caso.id)

      const documentos = await db.documentoSiniestro.findMany({
        where: { idSiniestro: caso.id },
        select: {
          id: true,
          nombreOriginal: true,
          urlArchivoSinDominio: true,
          claveImagenOptimizada: true,
          claveMiniatura: true,
        },
      })
      const claves = documentos.flatMap((d) =>
        [d.urlArchivoSinDominio, d.claveImagenOptimizada, d.claveMiniatura].filter(
          (k): k is string => !!k,
        ),
      )
      // Un caso con claves de otro entorno (por ejemplo, cargado con un Docker local sin R2_ENTORNO) no se toca:
      // se informa y se sigue con los demás.
      if (claves.some((k) => !perteneceClaveSiniestroR2(k, caso, entorno))) {
        registrar({
          tipo: 'omitido',
          id: String(caso.id),
          archivos: claves.length,
          carpeta: conEntornoR2(logica, entorno),
          motivo: 'tiene archivos de otro entorno o de otra carpeta; revisalo a mano',
        })
        continue
      }
      const pendientes = documentos.filter((d) => {
        const destino = destinos(d, logica)
        return (
          d.urlArchivoSinDominio !== `${conEntornoR2(logica, entorno)}/${destino.principal}` ||
          caso.carpetaR2 !== logica
        )
      })
      if (!pendientes.length && caso.carpetaR2 === logica) continue
      if (aplicar)
        await db.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "Siniestro" WHERE "id" = ${caso.id} FOR UPDATE`
            const previo = await tx.siniestro.findUniqueOrThrow({
              where: { id: caso.id },
              select: { id: true, carpetaR2: true, eliminacionEnCurso: true },
            })
            if (previo.eliminacionEnCurso)
              throw new HttpError(409, `El siniestro ${caso.id} está en proceso de eliminación.`)
            const filas = await tx.documentoSiniestro.findMany({
              where: { idSiniestro: caso.id },
              orderBy: { id: 'asc' },
            })
            // Con la carpeta anterior todavía reservada: las claves tienen que ser de este caso
            for (const d of filas)
              for (const key of [d.urlArchivoSinDominio, d.claveImagenOptimizada, d.claveMiniatura])
                if (key && !perteneceClaveSiniestroR2(key, previo, entorno))
                  throw new HttpError(
                    409,
                    'La ubicación del archivo cambió. Volvé a simular la reorganización.',
                  )
            const carpeta = await asegurarCarpetaSiniestroR2(tx, caso.id, { reformatear: true })
            for (const d of filas) {
              const destino = destinos(d, carpeta)
              const principal = await copiar(d.urlArchivoSinDominio, carpeta, destino.principal)
              const vista =
                d.claveImagenOptimizada && destino.vista
                  ? await copiar(d.claveImagenOptimizada, carpeta, destino.vista)
                  : null
              const miniatura =
                d.claveMiniatura && destino.miniatura
                  ? await copiar(d.claveMiniatura, carpeta, destino.miniatura)
                  : null
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
        // Archivos, no documentos: una imagen tiene su vista o su miniatura
        archivos: pendientes.flatMap((d) =>
          [d.urlArchivoSinDominio, d.claveImagenOptimizada, d.claveMiniatura].filter(Boolean),
        ).length,
        carpeta: conEntornoR2(logica, entorno),
      })
    }
  }

  // Sin documentos pero con la carpeta reservada en el formato anterior: se libera; la próxima carga reserva la nueva
  const sinDocumentos = (
    await db.siniestro.findMany({
      where: { carpetaR2: { not: null }, documentos: { none: {} } },
      select: { id: true, carpetaR2: true },
    })
  ).filter((c) => esCarpetaSiniestroAnteriorR2(c.carpetaR2!))
  for (const c of sinDocumentos) {
    if (aplicar)
      await db.siniestro.updateMany({
        where: { id: c.id, carpetaR2: c.carpetaR2, documentos: { none: {} } },
        data: { carpetaR2: null },
      })
    registrar({ tipo: 'carpeta', id: String(c.id), archivos: 0, carpeta: c.carpetaR2! })
  }

  // --- Plantillas: {entorno}/plantillas/ con nombre legible
  const plantillas = await db.documentoPlantilla.findMany({
    select: { id: true, urlArchivo: true, nombreOriginal: true, tipoExtension: true },
  })
  for (const p of plantillas) {
    exigirEntornoR2(p.urlArchivo, entorno)
    if (p.urlArchivo.startsWith(`${entorno}/plantillas/`) && !UUID.test(nombreDe(p.urlArchivo)))
      continue
    if (!/^(?:(dev|produccion)\/)?plantillas\//.test(p.urlArchivo))
      throw new HttpError(409, `La plantilla ${p.id} tiene una ubicación inesperada.`)
    const nombre = nombreLegibleR2(
      p.nombreOriginal,
      extensionDe(p.urlArchivo),
      codigoDe(p.urlArchivo),
    )
    if (aplicar) {
      const clave = await copiar(p.urlArchivo, 'plantillas', nombre)
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

  // --- Informes: {entorno}/informes/{AAAA}/{AAAA-MM}-{código}.pdf (antes "informes mensuales/AAAA/MM/")
  const informes = await db.informeMensual.findMany({
    where: { clavePdf: { not: null } },
    select: { id: true, clavePdf: true, periodo: true, prueba: true },
  })
  for (const i of informes) {
    const clave = i.clavePdf!
    exigirEntornoR2(clave, entorno)
    if (clave.startsWith(`${entorno}/informes/`)) continue
    if (!/^(?:(dev|produccion)\/)?informes mensuales\//.test(clave))
      throw new HttpError(409, `El informe ${i.id} tiene una ubicación inesperada.`)
    const nueva = claveInformeR2(i.periodo, i.prueba, codigoDe(clave))
    if (aplicar) {
      const copiada = await copiar(clave, carpetaDe(nueva), nombreDe(nueva))
      await db.informeMensual.updateMany({
        where: { id: i.id, clavePdf: clave },
        data: { clavePdf: copiada },
      })
    }
    registrar({
      tipo: 'informe',
      id: i.id,
      archivos: 1,
      carpeta: conEntornoR2(carpetaDe(nueva), entorno),
    })
  }

  return {
    aplicado: aplicar,
    registros: cambios.length,
    archivos: cambios.reduce((n, c) => n + c.archivos, 0),
    omitidos: cambios.filter((c) => c.tipo === 'omitido').length,
    sobrantes: await buscarSobrantes(db, r2, entorno),
  }
}

/**
 * Objetos del bucket que no usa ninguna referencia de la base: copias anteriores ya reorganizadas, pruebas viejas,
 * archivos de otro entorno. Solo se informan, no se borran. Los borradores del alta (altas/) no cuentan: vencen solos.
 */
export async function buscarSobrantes(
  db: PrismaClient,
  r2: Pick<AlmacenamientoR2, 'listar'>,
  entorno: EntornoR2,
): Promise<Sobrante[]> {
  const usados = new Set<string>()
  for (const d of await db.documentoSiniestro.findMany({
    select: { urlArchivoSinDominio: true, claveImagenOptimizada: true, claveMiniatura: true },
  }))
    for (const k of [d.urlArchivoSinDominio, d.claveImagenOptimizada, d.claveMiniatura])
      if (k) usados.add(k)
  for (const p of await db.documentoPlantilla.findMany({ select: { urlArchivo: true } }))
    usados.add(p.urlArchivo)
  for (const i of await db.informeMensual.findMany({
    where: { clavePdf: { not: null } },
    select: { clavePdf: true },
  }))
    usados.add(i.clavePdf!)
  const borrador = new RegExp(`^(?:${entorno}/)?altas/`)
  return (await r2.listar()).filter((o) => !usados.has(o.clave) && !borrador.test(o.clave))
}
