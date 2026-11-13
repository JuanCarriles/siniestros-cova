import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { HttpError } from '../utils/httpError.ts'

// Organización de R2 (docs/ORGANIZACION_R2.md). Cada bucket (uno por entorno) tiene adentro la carpeta de su
// entorno, con la misma estructura:
//   {entorno}/siniestros/{nºsiniestro}-{nºpóliza}/   documentos del expediente (y sus vistas y miniaturas)
//   {entorno}/altas/{idUsuario}/                      borradores del alta (vencen solos)
//   {entorno}/plantillas/
//   {entorno}/informes/{AAAA}/  e  informes/pruebas/{AAAA}/
//   {entorno}/pruebas/                                prueba de conexión (solo desarrollo)

export const entornoR2Schema = z.enum(['dev', 'produccion'])
export type EntornoR2 = z.output<typeof entornoR2Schema>
export function leerEntornoR2(variables: NodeJS.ProcessEnv = process.env): EntornoR2 {
  if (!variables.R2_ENTORNO && variables.NODE_ENV === 'production')
    throw new Error(
      'Configuración R2 inválida: R2_ENTORNO es obligatorio con NODE_ENV=production. Usá dev para Docker local o produccion para el VPS en backend/.env.',
    )
  const resultado = entornoR2Schema.safeParse(variables.R2_ENTORNO || 'dev')
  if (!resultado.success)
    throw new Error(
      'Configuración R2 inválida: R2_ENTORNO debe ser dev o produccion en backend/.env.',
    )
  return resultado.data
}
export function conEntornoR2(ruta: string, entorno: EntornoR2 = leerEntornoR2()): string {
  const primero = ruta.split('/')[0]
  if (primero === 'dev' || primero === 'produccion') {
    if (primero !== entorno)
      throw new HttpError(403, 'La ubicación del archivo pertenece a otro entorno.')
    return ruta
  }
  return `${entorno}/${ruta}`
}
export function exigirEntornoR2(clave: string, entorno: EntornoR2 = leerEntornoR2()): string {
  const prefijo = clave.split('/')[0]
  if ((prefijo === 'dev' || prefijo === 'produccion') && prefijo !== entorno)
    throw new HttpError(403, 'La ubicación del archivo pertenece a otro entorno.')
  // Compatibilidad de lectura con claves anteriores; los nuevos objetos siempre tienen entorno.
  return clave
}
// Escape reversible: no confunde A/B con A-B, espacios con guiones, ni los números 01 y 1.
// Se conserva el alfabeto de claves ya validado por shared. Un slash del número no crea subcarpetas.
export function segmentoNumeroR2(valor: string): string {
  if (!valor) return '_'
  const bytes = Buffer.from(valor, 'utf8')
  return [...bytes]
    .map((b) =>
      /[a-zA-Z0-9.-]/.test(String.fromCharCode(b)) && valor !== '.' && valor !== '..'
        ? String.fromCharCode(b)
        : `_${b.toString(16).toUpperCase().padStart(2, '0')}`,
    )
    .join('')
}
/** La carpeta de un siniestro: siniestros/{nºsiniestro}-{nºpóliza} (siniestro 1, póliza 1: siniestros/1-1) */
export function carpetaNumerosR2(caso: { numeroSiniestro: string; numeroPoliza: string }) {
  return `siniestros/${segmentoNumeroR2(caso.numeroSiniestro)}-${segmentoNumeroR2(caso.numeroPoliza)}`
}

/** Si dos siniestros dan la misma carpeta, el segundo lleva su id: siniestros/1-1-id57 */
export function carpetaConIdR2(base: string, id: number) {
  return `${base}-id${id}`
}

/** La carpeta reservada tiene el formato anterior (siniestros/{número}/{póliza}, en dos niveles) */
export function esCarpetaSiniestroAnteriorR2(carpeta: string) {
  return /^siniestros\/[^/]+\/[^/]+/.test(carpeta)
}

/**
 * Nombre de archivo legible al mirar el bucket: el nombre original limpio (sin tildes, espacios ni símbolos, en
 * minúsculas, hasta 60 caracteres) más un código corto que evita choques. "DNI frente (1).jpg" → dni-frente-1-3f9a2c41.jpg.
 * El nombre real completo sigue guardado en la base. `codigo`: para reorganizar archivos anteriores, el mismo en
 * cada intento (sale de su nombre anterior).
 */
export function nombreLegibleR2(
  nombreOriginal: string,
  extension: string,
  codigo = randomUUID().slice(0, 8),
) {
  const base = nombreOriginal
    .replace(/\.[^.]*$/, '')
    .normalize('NFD')
    // Saca las marcas de las tildes (á → a, ñ → n)
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return `${base || 'archivo'}-${codigo}.${extension.toLowerCase()}`
}
export function perteneceClaveSiniestroR2(
  clave: string,
  caso: { id: number; carpetaR2?: string | null },
  entorno = leerEntornoR2(),
) {
  try {
    exigirEntornoR2(clave, entorno)
  } catch {
    return false
  }
  // Comparar la carpeta exacta: 1/1 no debe autorizar 1/1/siniestro-OTRO.
  const carpeta = clave.slice(0, clave.lastIndexOf('/'))
  return (
    carpeta === `siniestros/${caso.id}` ||
    carpeta === `${entorno}/siniestros/${caso.id}` ||
    (!!caso.carpetaR2 && carpeta === `${entorno}/${caso.carpetaR2}`)
  )
}
export const carpetaR2Schema = z
  .string()
  .regex(
    /^(dev|produccion)\/(plantillas|pruebas|altas\/[1-9]\d*|siniestros\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+(?:\/siniestro-[1-9]\d*)?)?|informes\/(?:pruebas\/)?\d{4}|informes mensuales\/(?:pruebas\/)?\d{4}\/(0[1-9]|1[0-2]))$/,
  )
  .refine(
    (ruta) => ruta.split('/').every((segmento) => segmento !== '.' && segmento !== '..'),
    'Carpeta inválida',
  )
/** Informes: informes/{AAAA}/{AAAA-MM}-{código}.pdf. Se siguen leyendo los anteriores ("informes mensuales/…"). */
export const claveInformeR2Schema = z
  .string()
  .regex(
    /^(?:(?:(dev|produccion)\/)?informes mensuales\/(?:pruebas\/)?\d{4}\/(0[1-9]|1[0-2])\/[a-f0-9-]+|(dev|produccion)\/informes\/(?:pruebas\/)?\d{4}\/\d{4}-(0[1-9]|1[0-2])-[a-z0-9]+)\.pdf$/,
  )

/** La clave nueva de un informe mensual */
export function claveInformeR2(
  periodo: string,
  prueba: boolean,
  codigo = randomUUID().slice(0, 8),
) {
  return `informes/${prueba ? 'pruebas/' : ''}${periodo.slice(0, 4)}/${periodo}-${codigo}.pdf`
}
