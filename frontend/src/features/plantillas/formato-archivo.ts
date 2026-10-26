export function formatoTamanoArchivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  const enMB = bytes >= 1024 * 1024
  const valor = bytes / (enMB ? 1024 * 1024 : 1024)
  return `${valor.toLocaleString('es-AR', { maximumFractionDigits: enMB ? 2 : 1 })} ${enMB ? 'MB' : 'KB'}`
}
