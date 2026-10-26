import type {
  DatosCasoInput,
  OcupanteAltaData,
  TitularAltaData,
  VehiculoAltaData,
  VehiculoAltaInput,
} from '@cova/shared/schemas/siniestros-alta'

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

/** Personas ya validadas del paso 2. La clave las identifica dentro del alta (todavía no tienen id). */
export type TitularBorrador = TitularAltaData & { clave: string }
export type OcupanteBorrador = OcupanteAltaData & { clave: string }

/** Vehículo ya validado del paso 2, con su titular (uno o ninguno todavía) y sus ocupantes. */
export type VehiculoBorrador = VehiculoAltaData & {
  clave: string
  titular: TitularBorrador | null
  ocupantes: OcupanteBorrador[]
}

export const vehiculoVacio: VehiculoAltaInput = {
  rolAccidente: '',
  marca: '',
  modelo: '',
  version: '',
  dominio: '',
  numeroChasis: '',
  numeroMotor: '',
  anio: '',
  uso: '',
  tipo: '',
  color: '',
  idAseguradora: '',
  acreedorPrendario: '',
  descripcionDanos: '',
}

export type BorradorAlta = {
  version: 3
  /** Paso en el que quedó (1 = datos del caso) */
  paso: number
  datosCaso: DatosCasoFormulario
  vehiculos: VehiculoBorrador[]
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
    const borrador = JSON.parse(texto) as Omit<Partial<BorradorAlta>, 'version'> & {
      version?: number
    }
    if (typeof borrador?.datosCaso !== 'object' || !borrador.datosCaso) return null
    // Las versiones anteriores se retoman igual: la 1 sin vehículos, la 2 con vehículos sin personas
    if (borrador.version === 1) return { ...borrador, version: 3, vehiculos: [] } as BorradorAlta
    if (!Array.isArray(borrador.vehiculos) || (borrador.version !== 2 && borrador.version !== 3))
      return null
    const vehiculos = borrador.vehiculos.map((v) => ({
      ...v,
      titular: v.titular ?? null,
      ocupantes: Array.isArray(v.ocupantes) ? v.ocupantes : [],
    }))
    return { ...borrador, version: 3, vehiculos } as BorradorAlta
  } catch {
    return null
  }
}

export function guardarBorrador(
  idUsuario: number,
  datos: Pick<BorradorAlta, 'paso' | 'datosCaso' | 'vehiculos'>,
) {
  const borrador: BorradorAlta = { version: 3, ...datos, guardado: new Date().toISOString() }
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
