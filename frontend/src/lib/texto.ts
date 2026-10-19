// Para buscar sin importar mayúsculas ni tildes: "rio" encuentra "Río Plata"
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .trim()
}

/** "1 aseguradora" / "6 aseguradoras" */
export function plural(cantidad: number, singular: string, pluralTexto = `${singular}s`): string {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`
}
