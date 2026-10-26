import type { DatosCasoInput } from '@cova/shared/schemas/siniestros-alta'

// Alta de siniestro a medio cargar (CU-09, flujo alternativo "el proceso se interrumpe"). Vive solo en este
// navegador, uno por usuario, hasta que se confirma el alta o se cancela. Nada se graba en el servidor antes.

/** Valores del formulario del paso 1, tal como se escriben (texto). El país solo filtra provincias. */
export type DatosCasoFormulario = DatosCasoInput & { pais: string }

export const datosCasoVacios: DatosCasoFormulario = {
  numeroSiniestro: '',
  numeroPoliza: '',
  inicioVigencia: '',
  idAseguradora: '',
  sucursal: '',
  idAjustador: '',
  fechaOcurrencia: '',
  horaOcurrencia: '',
  menorEdadInvolucrado: false,
  causa: '',
  pais: '',
  lugar: { idProvincia: '', localidad: '', calle: '', codigoPostal: '' },
}

export type BorradorAlta = {
  version: 1
  /** Paso en el que quedó (1 = datos del caso) */
  paso: number
  datosCaso: DatosCasoFormulario
  /** ISO: cuándo se guardó por última vez */
  guardado: string
}

const clave = (idUsuario: number) => `cova.altaSiniestro.${idUsuario}`

// El almacenamiento puede no estar disponible (navegación privada, sitio bloqueado): el alta sigue funcionando,
// solo que sin poder retomarse.
export function leerBorrador(idUsuario: number): BorradorAlta | null {
  try {
    const texto = localStorage.getItem(clave(idUsuario))
    if (!texto) return null
    const borrador = JSON.parse(texto) as Partial<BorradorAlta> | null
    if (borrador?.version !== 1 || typeof borrador.datosCaso !== 'object' || !borrador.datosCaso)
      return null
    return borrador as BorradorAlta
  } catch {
    return null
  }
}

export function guardarBorrador(idUsuario: number, paso: number, datosCaso: DatosCasoFormulario) {
  const borrador: BorradorAlta = { version: 1, paso, datosCaso, guardado: new Date().toISOString() }
  try {
    localStorage.setItem(clave(idUsuario), JSON.stringify(borrador))
  } catch {
    // Sin espacio o sin permiso: se sigue sin guardar
  }
}

export function borrarBorrador(idUsuario: number) {
  try {
    localStorage.removeItem(clave(idUsuario))
  } catch {
    // Nada que borrar
  }
}
