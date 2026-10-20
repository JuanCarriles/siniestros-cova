// Columnas del listado de siniestros (CU-09 paso 2). Para que la tabla entre completa en una pantalla de escritorio,
// los datos afines comparten columna en dos líneas: aseguradora y su ajustador; gestor y fecha de asignación.
export const COLUMNAS = [
  { id: 'siniestro', titulo: 'Siniestro', fija: true },
  { id: 'asegurado', titulo: 'Asegurado', fija: true },
  { id: 'terceros', titulo: 'Terceros' },
  { id: 'aseguradora', titulo: 'Aseguradora', subtitulo: 'Ajustador' },
  { id: 'gestor', titulo: 'Gestor', subtitulo: 'Asignación', soloAdministracion: true },
  { id: 'estado', titulo: 'Estado' },
  { id: 'pericias', titulo: 'Pericias' },
  { id: 'abogado', titulo: 'Abogado' },
  { id: 'dias', titulo: 'Días sin mov.', tituloCompleto: 'Días sin movimiento' },
] as const

export type ColumnaSiniestros = (typeof COLUMNAS)[number]
export type IdColumna = ColumnaSiniestros['id']

/** Columnas que ve este rol: el gestor no ve la de gestor (son todos suyos). */
export function columnasDelRol(esGestor: boolean) {
  return COLUMNAS.filter((c) => !esGestor || !('soloAdministracion' in c))
}
