import type { PermisoBajaDocumento } from './documentos.ts'
import type {
  RolAccidente,
  TipoEventoHistorial,
  TipoLesion,
  TipoPerito,
  TipoUsuario,
  UsoVehiculo,
} from './enums.ts'

// Ficha del siniestro (CU-10, E5-01): lo que devuelve cada endpoint de lectura. La cabecera y los datos del caso
// vienen juntos (GET /api/siniestros/:id); cada pestaña pide lo suyo (GET /api/siniestros/:id/<pestaña>).
// Fechas de un día: "aaaa-mm-dd"; horas: "hh:mm"; momentos: ISO.

export type DireccionFicha = {
  /** Para precargar el formulario al modificar, aunque el país esté dado de baja */
  idPais: number | null
  pais: string | null
  /** Para precargar el formulario al modificar */
  idProvincia: number | null
  provincia: string | null
  localidad: string | null
  calle: string | null
  codigoPostal: string | null
}

export type FichaSiniestro = {
  id: number
  numeroSiniestro: string
  numeroPoliza: string
  montoReclamado?: string | null
  montoAcordado?: string | null
  moneda?: string
  resultadoCierre?: string | null
  inicioVigencia: string | null
  sucursal: string | null
  aseguradora: { id: number; nombre: string }
  ajustador: { id: number; nombre: string } | null
  asignado: { id: number; nombre: string }
  fechaAsignacion: string
  estado: { id: number; nombre: string; descripcion: string; esCierre: boolean }
  /** Dado de baja: solo lo abren administradores */
  fechaBaja: string | null
  diasSinMovimiento: number
  hecho: {
    fechaOcurrencia: string | null
    horaOcurrencia: string | null
    menorEdadInvolucrado: boolean
    causa: string | null
  }
  lugar: DireccionFicha | null
  /** Para las pestañas. Vehículos y partes cuenta los vehículos y las personas fuera de ellos. */
  cantidades: {
    vehiculosYPartes: number
    abogados: number
    peritos: number
    novedades: number
    documentos: number
    /** Mensajes del chat de otros que el usuario todavía no leyó (E7-03) */
    chatSinLeer: number
  }
}

export type PersonaFicha = {
  id: number
  /** Cuántas veces se modificó: se manda al guardar, para no pisar el cambio de otro usuario (E5-06) */
  revision: number
  /** null si se cargó sin nombre */
  nombre: string | null
  idTipoDocumento: number | null
  tipoDocumento: string | null
  documento: string | null
  estadoCivil: string | null
  sexo: string | null
  fechaNacimiento: string | null
  telefono: string | null
  email: string | null
  domicilio: DireccionFicha | null
  lesion: { tipo: TipoLesion; descripcion: string | null } | null
  abogado: { id: number; nombreCompleto: string } | null
}

/** Titular u ocupante */
export type PersonaVehiculoFicha = PersonaFicha & {
  /** Del titular: si iba en el vehículo. Los ocupantes iban siempre. */
  ibaEnVehiculo: boolean
  /** Conductor/a, acompañante… */
  lugarEnVehiculo: string | null
  numeroPermisoConducir: string | null
  fechaVencimientoCarnet: string | null
  /** Solo de los ocupantes */
  relacionTitular: string | null
}

export type VehiculoFicha = {
  id: number
  /** Cuántas veces se modificó: se manda al guardar, para no pisar el cambio de otro usuario (E5-06) */
  revision: number
  rolAccidente: RolAccidente | null
  marca: string | null
  modelo: string | null
  version: string | null
  dominio: string
  anio: number | null
  uso: UsoVehiculo | null
  tipo: string | null
  color: string | null
  numeroChasis: string | null
  numeroMotor: string | null
  idAseguradora: number | null
  aseguradora: string | null
  acreedorPrendario: string | null
  descripcionDanos: string | null
  titular: PersonaVehiculoFicha | null
  ocupantes: PersonaVehiculoFicha[]
}

/** GET /api/siniestros/:id/vehiculos (CU-10 1.c) */
export type VehiculosYPartesFicha = {
  vehiculos: VehiculoFicha[]
  personasFuera: (PersonaFicha & { rolSinVehiculo: string | null })[]
}

/** GET /api/siniestros/:id/abogados (CU-10 1.d) */
export type AbogadoFicha = {
  id: number
  /** Cuántas veces se modificó: se manda al guardar, para no pisar el cambio de otro usuario (E5-07) */
  revision: number
  nombreCompleto: string
  numeroMatricula: string | null
  telefono: string | null
  email: string | null
  representa: { id: number; nombre: string | null }[]
}

/** GET /api/siniestros/:id/peritos (CU-10 1.e) */
export type PeritoFicha = {
  id: number
  /** Cuántas veces se modificó: se manda al guardar, para no pisar el cambio de otro usuario (E5-07) */
  revision: number
  tipo: TipoPerito
  nombre: string
  telefono: string | null
  email: string | null
  fechaSolicitud: string
  fechaCierre: string | null
  cerrado: boolean
}

/** GET /api/siniestros/:id/novedades (CU-10 1.f), de la más nueva a la más vieja (E5-08: queda junto al campo de carga) */
export type NovedadFicha = {
  id: number
  descripcion: string
  fechaCarga: string
  /** El nombre y el rol de quien la cargó, tal como eran en ese momento. Sin rol en las anteriores a E5-08. */
  autor: { nombre: string; tipoUsuario: TipoUsuario | null }
}

/** GET /api/siniestros/:id/documentos (CU-10 1.g), del más nuevo al más viejo */
export type DocumentoFicha = {
  eliminado: boolean
  fechaBaja: string | null
  motivoBaja: string | null
  autorBaja: { nombre: string; tipoUsuario: TipoUsuario } | null
  reactivacion: PermisoBajaDocumento
  baja: PermisoBajaDocumento
  /** Sin claves privadas ni URLs persistidas: se accede por endpoints autorizados. */
  imagen: {
    anchoOriginal: number
    altoOriginal: number
    ancho: number
    alto: number
    tamanoBytes: string
  } | null
  id: number
  nombreOriginal: string
  tipoExtension: string
  /** En texto: el tamaño se guarda como BigInt */
  tamanoBytes: string
  fechaCarga: string
  autor: { nombre: string; tipoUsuario: TipoUsuario }
}

/** GET /api/siniestros/:id/historial (CU-10 1.i), del más nuevo al más viejo: el alta queda al final */
export type EventoHistorialFicha = {
  id: number
  tipo: TipoEventoHistorial
  descripcion: string
  fecha: string
  usuario: { nombre: string; tipoUsuario: TipoUsuario }
}
