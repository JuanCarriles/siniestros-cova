// Nombres del catálogo vigente (backend/prisma/seeds/catalogos.ts).
// Este mapa sólo decide la apariencia: no define reglas del negocio ni depende de IDs.
export const estadosVisuales = {
  'En tratamiento': 'info',
  'Esperando documentación': 'warning',
  'En pericia': 'warning',
  'En negociación': 'warning',
  'Cierre pendiente': 'warning',
  'Solicitud de cierre': 'info',
  'Cierre enviado': 'success',
} as const

export function tonoDeEstado(nombre: string | null | undefined) {
  if (nombre && Object.hasOwn(estadosVisuales, nombre)) {
    return estadosVisuales[nombre as keyof typeof estadosVisuales]
  }
  return 'neutral'
}
