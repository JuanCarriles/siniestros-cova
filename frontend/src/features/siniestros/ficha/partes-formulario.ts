import type {
  PersonaFicha,
  PersonaVehiculoFicha,
  VehiculoFicha,
  VehiculosYPartesFicha,
} from '@cova/shared/schemas/ficha-siniestro'
import {
  ESTADOS_CIVILES,
  LUGARES_EN_VEHICULO,
  SEXOS,
  type OcupanteAltaData,
  type PersonaExternaAltaData,
  type TitularAltaData,
  type VehiculoAltaData,
} from '@cova/shared/schemas/siniestros-alta'

// De lo que muestra la ficha a lo que precargan los formularios del alta (CU-10 1.c.5, E5-06): modificar un vehículo
// o una persona abre el mismo modal del alta con sus datos. Las personas llevan una clave ("p12") para no avisarse
// a sí mismas como documento repetido.

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
