import type {
  AbogadoFicha,
  PeritoFicha,
  PersonaFicha,
  PersonaVehiculoFicha,
  VehiculoFicha,
  VehiculosYPartesFicha,
} from '@cova/shared/schemas/ficha-siniestro'
import {
  ESTADOS_CIVILES,
  LUGARES_EN_VEHICULO,
  SEXOS,
  hoyArgentina,
  type OcupanteAltaData,
  type PersonaExternaAltaData,
  type TitularAltaData,
  type VehiculoAltaData,
} from '@cova/shared/schemas/siniestros-alta'
import type { PersonasRepresentables } from '../abogados-alta'
import type { AbogadoBorrador, PeritoBorrador } from '../borrador-alta'

// De lo que muestra la ficha a lo que precargan los formularios del alta (CU-10 1.c.5, E5-06, y 1.d.2 y 1.e.2,
// E5-07): modificar un vehículo, una persona, un abogado o un perito abre el mismo modal del alta con sus datos. Las
// personas llevan una clave ("p12") para no avisarse a sí mismas como documento repetido; los abogados representan
// a esas claves.

export const clavePersona = (id: number) => `p${id}`

/**
 * La opción de la lista que corresponde a lo guardado. Los formularios guardan la opción tal cual ("Casado/a"),
 * pero datos cargados de otra forma pueden tener una sola variante ("Casada", "Conductor"): se reconoce. Lo que no
 * se reconoce vuelve vacío, para elegirlo, en vez de un error que el formulario no puede mostrar.
 */
export function opcionDeLista<T extends string>(
  guardado: string | null,
  lista: readonly T[],
): T | null {
  if (!guardado) return null
  const buscado = guardado.trim().toLocaleLowerCase('es')
  const variantes = (opcion: string) => {
    const o = opcion.toLocaleLowerCase('es')
    const doble = /^(.*?)(o|)\/a$/.exec(o)
    return doble ? [o, `${doble[1]}${doble[2] || ''}`, `${doble[1]}a`] : [o]
  }
  return lista.find((opcion) => variantes(opcion).includes(buscado)) ?? null
}

export function vehiculoAFormulario(v: VehiculoFicha): VehiculoAltaData {
  return {
    // Uno sin rol (cargado antes de que fuera obligatorio) abre sin rol elegido: el formulario lo pide
    rolAccidente: v.rolAccidente ?? ('' as VehiculoAltaData['rolAccidente']),
    marca: v.marca,
    modelo: v.modelo,
    version: v.version,
    dominio: v.dominio,
    numeroChasis: v.numeroChasis,
    numeroMotor: v.numeroMotor,
    anio: v.anio,
    uso: v.uso,
    tipo: v.tipo,
    color: v.color,
    idAseguradora: v.idAseguradora,
    acreedorPrendario: v.acreedorPrendario,
    descripcionDanos: v.descripcionDanos,
  }
}

function comunes(p: PersonaFicha) {
  return {
    nombreCompletoRazonSocial: p.nombre,
    idTipoDocumento: p.idTipoDocumento,
    documento: p.documento,
    estadoCivil: opcionDeLista(p.estadoCivil, ESTADOS_CIVILES),
    sexo: opcionDeLista(p.sexo, SEXOS),
    fechaNacimiento: p.fechaNacimiento,
    telefono: p.telefono,
    email: p.email,
    domicilio: {
      idProvincia: p.domicilio?.idProvincia ?? null,
      localidad: p.domicilio?.localidad ?? null,
      calle: p.domicilio?.calle ?? null,
      codigoPostal: p.domicilio?.codigoPostal ?? null,
    },
    conLesiones: p.lesion !== null,
    tipoLesion: p.lesion?.tipo ?? null,
    descripcionLesiones: p.lesion?.descripcion ?? null,
  }
}

/** Lo guardado es el lugar ya resuelto: uno de la lista se elige; cualquier otro va en "Otro" */
function lugar(guardado: string | null) {
  if (!guardado) return { lugar: null, lugarOtro: null }
  const deLaLista = opcionDeLista(
    guardado,
    LUGARES_EN_VEHICULO.filter((l) => l !== 'Otro'),
  )
  return deLaLista
    ? { lugar: deLaLista, lugarOtro: null }
    : { lugar: 'Otro' as const, lugarOtro: guardado }
}

export function titularAFormulario(p: PersonaVehiculoFicha): TitularAltaData & { clave: string } {
  return {
    clave: clavePersona(p.id),
    ...comunes(p),
    ibaEnVehiculo: p.ibaEnVehiculo,
    ...lugar(p.ibaEnVehiculo ? p.lugarEnVehiculo : null),
    numeroPermisoConducir: p.numeroPermisoConducir,
    fechaVencimientoCarnet: p.fechaVencimientoCarnet,
  }
}

export function ocupanteAFormulario(p: PersonaVehiculoFicha): OcupanteAltaData & { clave: string } {
  return {
    clave: clavePersona(p.id),
    ...comunes(p),
    ...lugar(p.lugarEnVehiculo),
    relacionPropietario: p.relacionTitular,
    numeroPermisoConducir: p.numeroPermisoConducir,
    fechaVencimientoCarnet: p.fechaVencimientoCarnet,
  }
}

export function externaAFormulario(
  p: PersonaFicha & { rolSinVehiculo: string | null },
): PersonaExternaAltaData & { clave: string } {
  return { clave: clavePersona(p.id), ...comunes(p), rolSinVehiculo: p.rolSinVehiculo ?? '' }
}

/** Las personas activas del siniestro, para avisar en el formulario si un documento ya está cargado */
export function personasDelSiniestro({ vehiculos, personasFuera }: VehiculosYPartesFicha) {
  const persona = (p: PersonaFicha) => ({
    clave: clavePersona(p.id),
    documento: p.documento,
    nombreCompletoRazonSocial: p.nombre,
  })
  return {
    vehiculos: vehiculos.map((v) => ({
      dominio: v.dominio,
      titular: v.titular && persona(v.titular),
      ocupantes: v.ocupantes.map(persona),
    })),
    personasExternas: personasFuera.map((p) => ({
      ...persona(p),
      rolSinVehiculo: p.rolSinVehiculo,
    })),
  }
}

// ------------------------------------------------------------------ Abogados y peritos (E5-07)

const claveAbogado = (id: number) => `a${id}`

/** De la clave de una persona a su id: "p12" → 12 */
export const idDePersona = (clave: string) => Number(clave.slice(1))

export function abogadoAFormulario(a: AbogadoFicha): AbogadoBorrador {
  return {
    clave: claveAbogado(a.id),
    nombreCompleto: a.nombreCompleto,
    numeroMatricula: a.numeroMatricula,
    telefono: a.telefono,
    email: a.email,
    representados: a.representa.map((p) => clavePersona(p.id)),
  }
}

/** Las personas guardadas, para elegir a quién representa un abogado (como en el paso 3 del alta) */
export function representablesDeFicha({
  vehiculos,
  personasFuera,
}: VehiculosYPartesFicha): PersonasRepresentables {
  return {
    vehiculos: vehiculos.map((v) => ({
      dominio: v.dominio,
      rolAccidente: v.rolAccidente,
      titular: v.titular && { clave: clavePersona(v.titular.id) },
      ocupantes: v.ocupantes.map((o) => ({ clave: clavePersona(o.id), lugar: o.lugarEnVehiculo })),
    })),
    personasExternas: personasFuera.map((p) => ({
      clave: clavePersona(p.id),
      rolSinVehiculo: p.rolSinVehiculo,
    })),
  }
}

/** Quién representa hoy a cada persona guardada (clave de la persona → abogado) */
export function representantesDeFicha({ vehiculos, personasFuera }: VehiculosYPartesFicha) {
  const personas = [
    ...vehiculos.flatMap((v) => [...(v.titular ? [v.titular] : []), ...v.ocupantes]),
    ...personasFuera,
  ]
  return new Map(
    personas.flatMap((p) =>
      p.abogado
        ? [
            [
              clavePersona(p.id),
              { clave: claveAbogado(p.abogado.id), nombreCompleto: p.abogado.nombreCompleto },
            ] as const,
          ]
        : [],
    ),
  )
}

/** Las fechas se guardan con hora: el formulario muestra su día en la Argentina */
export function peritoAFormulario(p: PeritoFicha): PeritoBorrador {
  return {
    tipoPerito: p.tipo,
    nombre: p.nombre,
    telefono: p.telefono,
    email: p.email,
    fechaSolicitud: hoyArgentina(new Date(p.fechaSolicitud)),
    fechaCierre: p.fechaCierre ? hoyArgentina(new Date(p.fechaCierre)) : null,
    cerrado: p.cerrado,
  }
}
