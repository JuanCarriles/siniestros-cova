import type {
  AbogadoAltaData,
  DatosCasoInput,
  OcupanteAltaData,
  PersonaExternaAltaData,
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
/** Peatón, testigo, dueño de una propiedad…: no iba en ningún vehículo */
export type PersonaExternaBorrador = PersonaExternaAltaData & { clave: string }
/** Abogado ya validado del paso 3; representados son claves de personas del paso 2 */
export type AbogadoBorrador = AbogadoAltaData & { clave: string }

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
  version: 5
  /** Paso en el que quedó (1 = datos del caso) */
  paso: number
  datosCaso: DatosCasoFormulario
  vehiculos: VehiculoBorrador[]
  personasExternas: PersonaExternaBorrador[]
  abogados: AbogadoBorrador[]
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
    // Las versiones anteriores se retoman igual: la 1 sin vehículos, la 2 con vehículos sin personas, la 3 sin
    // personas fuera de los vehículos, la 4 sin abogados
    if (borrador.version === 1)
      return {
        ...borrador,
        version: 5,
        vehiculos: [],
        personasExternas: [],
        abogados: [],
      } as BorradorAlta
    if (!Array.isArray(borrador.vehiculos) || ![2, 3, 4, 5].includes(borrador.version ?? 0))
      return null
    const vehiculos = borrador.vehiculos.map((v) => ({
      ...v,
      titular: v.titular ?? null,
      ocupantes: Array.isArray(v.ocupantes) ? v.ocupantes : [],
    }))
    const personasExternas = Array.isArray(borrador.personasExternas)
      ? borrador.personasExternas
      : []
    const abogados = Array.isArray(borrador.abogados) ? borrador.abogados : []
    return { ...borrador, version: 5, vehiculos, personasExternas, abogados } as BorradorAlta
  } catch {
    return null
  }
}

export function guardarBorrador(
  idUsuario: number,
  datos: Omit<BorradorAlta, 'version' | 'guardado'>,
) {
  const borrador: BorradorAlta = { version: 5, ...datos, guardado: new Date().toISOString() }
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
