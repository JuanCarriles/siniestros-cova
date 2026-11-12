import { z } from 'zod'
import { HttpError } from '../utils/httpError.ts'

export const entornoR2Schema = z.enum(['dev', 'produccion'])
export type EntornoR2 = z.output<typeof entornoR2Schema>
export function leerEntornoR2(variables: NodeJS.ProcessEnv = process.env): EntornoR2 {
  return entornoR2Schema.parse(
    variables.R2_ENTORNO || (variables.NODE_ENV === 'production' ? 'produccion' : 'dev'),
  )
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
export function carpetaNumerosR2(caso: { numeroSiniestro: string; numeroPoliza: string }) {
  return `siniestros/${segmentoNumeroR2(caso.numeroSiniestro)}/${segmentoNumeroR2(caso.numeroPoliza)}`
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
    /^(dev|produccion)\/(plantillas|pruebas|altas\/[1-9]\d*|siniestros\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+(?:\/siniestro-[1-9]\d*)?)?|informes mensuales\/(?:pruebas\/)?\d{4}\/(0[1-9]|1[0-2]))$/,
  )
  .refine(
    (ruta) => ruta.split('/').every((segmento) => segmento !== '.' && segmento !== '..'),
    'Carpeta inválida',
  )
export const claveInformeR2Schema = z
  .string()
  .regex(
    /^(?:(dev|produccion)\/)?informes mensuales\/(?:pruebas\/)?\d{4}\/(0[1-9]|1[0-2])\/[a-f0-9-]+\.pdf$/,
  )
