import { useState } from 'react'
import { COLUMNAS, type IdColumna } from '../columnas'

const CLAVE = 'cova.siniestros.columnasOcultas'
const ocultables = new Set<string>(COLUMNAS.filter((c) => !('fija' in c)).map((c) => c.id))

// El navegador puede negar el almacenamiento (ventana privada, datos bloqueados): entonces se ven todas
function leer(): Set<IdColumna> {
  try {
    const guardadas: unknown = JSON.parse(localStorage.getItem(CLAVE) ?? '[]')
    if (!Array.isArray(guardadas)) return new Set()
    return new Set(guardadas.filter((id): id is IdColumna => ocultables.has(id as string)))
  } catch {
    return new Set()
  }
}

/** Columnas que el usuario eligió ocultar, recordadas en este navegador. Las fijas no se pueden ocultar. */
export function useColumnasVisibles() {
  const [ocultas, setOcultas] = useState(leer)

  function alternar(id: IdColumna) {
    if (!ocultables.has(id)) return
    const nuevas = new Set(ocultas)
    if (nuevas.has(id)) nuevas.delete(id)
    else nuevas.add(id)
    setOcultas(nuevas)
    try {
      localStorage.setItem(CLAVE, JSON.stringify([...nuevas]))
    } catch {
      // Sin almacenamiento la elección dura hasta recargar
    }
  }

  return {
    visible: (id: IdColumna) => !ocultas.has(id),
    alternar,
    mostrarTodas: () => {
      setOcultas(new Set())
      try {
        localStorage.removeItem(CLAVE)
      } catch {
        // Igual que arriba
      }
    },
    cantidadOcultas: ocultas.size,
  }
}
