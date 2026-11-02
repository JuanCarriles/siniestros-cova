import type {
  AbogadoAltaData,
  OcupanteAltaData,
  PeritoAltaData,
  PersonaExternaAltaData,
  TitularAltaData,
  VehiculoAltaData,
} from '@cova/shared/schemas/siniestros-alta'
import type { Prisma } from '../../generated/prisma/client.ts'

// Cómo se guardan los vehículos, las personas, los abogados y los peritos de un siniestro, a partir de los
// formularios del alta (CU-09). Lo usan el alta (E4-05 a E4-09) y la ficha al agregar o modificar (CU-10 1.c a 1.e,
// E5-06 y E5-07): las dos guardan igual.

/** Las fechas sin hora (AAAA-MM-DD) van a columnas Date */
export const dia = (fecha: string) => new Date(`${fecha}T00:00:00Z`)

/** Las fechas de los peritos van a Timestamptz: al mediodía de la Argentina, para que ningún huso las corra de día */
export const diaArgentina = (fecha: string) => new Date(`${fecha}T12:00:00-03:00`)

/** Los datos de contacto del abogado; a quién representa se guarda en cada persona */
export function datosAbogado(a: Omit<AbogadoAltaData, 'representados'>) {
  return {
    nombreCompleto: a.nombreCompleto,
    numeroMatricula: a.numeroMatricula ?? null,
    telefono: a.telefono ?? null,
    email: a.email ?? null,
  }
}

/** Sin el tipo: no cambia una vez cargado */
export function datosPerito(p: PeritoAltaData) {
  return {
    nombre: p.nombre,
    telefono: p.telefono ?? null,
    email: p.email ?? null,
    fechaSolicitud: diaArgentina(p.fechaSolicitud),
    fechaCierre: p.fechaCierre ? diaArgentina(p.fechaCierre) : null,
    cerrado: p.cerrado,
  }
}

export type TipoPersona = 'titular' | 'ocupante' | 'externa'
export type PersonaPorTipo = {
  titular: TitularAltaData
  ocupante: OcupanteAltaData
  externa: PersonaExternaAltaData
}

export function datosVehiculo(v: VehiculoAltaData) {
  return {
    dominio: v.dominio,
    rolAccidente: v.rolAccidente,
    marca: v.marca ?? null,
    modelo: v.modelo ?? null,
    version: v.version ?? null,
    numeroChasis: v.numeroChasis ?? null,
    numeroMotor: v.numeroMotor ?? null,
    anio: v.anio ?? null,
    uso: v.uso ?? null,
    tipo: v.tipo ?? null,
    color: v.color ?? null,
    idAseguradora: v.idAseguradora ?? null,
    acreedorPrendario: v.acreedorPrendario ?? null,
    descripcionDanos: v.descripcionDanos ?? null,
  } satisfies Partial<Prisma.VehiculoUncheckedCreateInput>
}

type Domicilio = {
  idProvincia?: number | null
  localidad?: string | null
  calle?: string | null
  codigoPostal?: string | null
}

/** Sin ningún dato, no se guarda una dirección vacía */
export function datosDireccion(d: Domicilio) {
  if (!(d.idProvincia || d.localidad || d.calle || d.codigoPostal)) return null
  return {
    idProvincia: d.idProvincia ?? null,
    localidad: d.localidad ?? null,
    calle: d.calle ?? null,
    codigoPostal: d.codigoPostal ?? null,
  }
}

const lugar = (p: { lugar?: string | null; lugarOtro?: string | null }) =>
  (p.lugar === 'Otro' ? p.lugarOtro : p.lugar) ?? null
const permiso = (p: TitularAltaData | OcupanteAltaData) => ({
  numeroPermisoConducir: p.numeroPermisoConducir ?? null,
  fechaVencimientoCarnet: p.fechaVencimientoCarnet ? dia(p.fechaVencimientoCarnet) : null,
})

/**
 * Los datos de la persona sin el siniestro, el vehículo, la dirección ni el abogado. Los campos que no son de su
 * tipo quedan vacíos, así una persona modificada no arrastra datos de otro tipo. Sin nombre se guarda vacío:
 * "Desconocido N" es solo cómo se muestra.
 */
export function datosPersona<T extends TipoPersona>(tipo: T, p: PersonaPorTipo[T]) {
  const comunes = {
    nombreCompletoRazonSocial: p.nombreCompletoRazonSocial ?? null,
    idTipoDocumento: p.idTipoDocumento ?? null,
    documento: p.documento ?? null,
    estadoCivil: p.estadoCivil ?? null,
    sexo: p.sexo ?? null,
    fechaNacimiento: p.fechaNacimiento ? dia(p.fechaNacimiento) : null,
    telefono: p.telefono ?? null,
    email: p.email ?? null,
    tipoLesion: p.conLesiones ? (p.tipoLesion ?? null) : null,
    descripcionLesiones: p.conLesiones ? (p.descripcionLesiones ?? null) : null,
  }
  const sinVehiculo = {
    esPropietario: null,
    esOcupante: false,
    rolEnVehiculo: null,
    relacionPropietario: null,
    numeroPermisoConducir: null,
    fechaVencimientoCarnet: null,
    rolSinVehiculo: null,
  }
  if (tipo === 'titular') {
    const t = p as TitularAltaData
    return {
      ...comunes,
      ...sinVehiculo,
      esPropietario: true,
      esOcupante: t.ibaEnVehiculo,
      rolEnVehiculo: t.ibaEnVehiculo ? lugar(t) : null,
      ...permiso(t),
    }
  }
  if (tipo === 'ocupante') {
    const o = p as OcupanteAltaData
    return {
      ...comunes,
      ...sinVehiculo,
      esPropietario: false,
      esOcupante: true,
      rolEnVehiculo: lugar(o),
      relacionPropietario: o.relacionPropietario ?? null,
      ...permiso(o),
    }
  }
  return {
    ...comunes,
    ...sinVehiculo,
    rolSinVehiculo: (p as PersonaExternaAltaData).rolSinVehiculo,
  }
}
