export function rutaArchivoDocumento(
  idSiniestro: number,
  idDocumento: number,
  tipo: 'miniatura' | 'vista' | 'original' | 'contenido',
  bajas = false,
) {
  return `/api/siniestros/${idSiniestro}/documentos/${idDocumento}/${tipo}${bajas ? '?bajas=true' : ''}`
}
