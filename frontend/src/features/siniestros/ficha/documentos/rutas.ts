export function rutaArchivoDocumento(
  idSiniestro: number,
  idDocumento: number,
  tipo: 'miniatura' | 'vista' | 'original',
) {
  return `/api/siniestros/${idSiniestro}/documentos/${idDocumento}/${tipo}`
}
