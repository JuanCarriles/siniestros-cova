import type { CrearSiniestroInput, SiniestroCreado } from '@cova/shared/schemas/siniestros-alta'
import type { BorradorAlta } from './borrador-alta'

// Paso 5 del alta (CU-09 pasos 35-36, E4-10): de lo que guarda el borrador a lo que se manda al confirmar.

type Alta = Omit<BorradorAlta, 'version' | 'paso' | 'guardado'>

/**
 * Lo cargado en los cinco pasos, como lo espera el servidor. Las personas van con la clave que usan los
 * abogados para decir a quién representan; lo que es solo de la pantalla (el país, las claves de vehículos y
 * abogados, si la pericia está cerrada) no se manda: el servidor lo resuelve.
 */
export function armarAlta(alta: Alta): CrearSiniestroInput {
  const { pais: _pais, ...datosCaso } = alta.datosCaso
  return {
    datosCaso,
    vehiculos: alta.vehiculos.map(({ clave: _clave, titular, ocupantes, ...datos }) => ({
      datos,
      titular: titular && { clave: titular.clave, datos: sinClave(titular) },
      ocupantes: ocupantes.map((o) => ({ clave: o.clave, datos: sinClave(o) })),
    })),
    personasExternas: alta.personasExternas.map((p) => ({ clave: p.clave, datos: sinClave(p) })),
    abogados: alta.abogados.map(sinClave),
    peritos: alta.peritos.map(({ cerrado: _cerrado, ...p }) => p),
    documentos: alta.documentos,
    idUsuarioAsignado: alta.idUsuarioAsignado ?? '',
  }
}

function sinClave<T extends { clave: string }>({ clave: _clave, ...resto }: T) {
  return resto
}

/** Lo que el alta le deja al listado al terminar */
export type EstadoAltaCreada = { altaCreada: SiniestroCreado }

/** El aviso del listado después de crear (36.a: si el mail no salió, se dice) */
export function mensajeAltaCreada(estado: unknown): string | null {
  const creado = (estado as Partial<EstadoAltaCreada> | null)?.altaCreada
  if (!creado) return null
  return `Se creó el siniestro ${creado.numeroSiniestro} y se avisó al usuario asignado en el sistema${
    creado.correoEnviado
      ? ' y por mail.'
      : '. El aviso por mail no se pudo enviar: avisale por otro medio.'
  }`
}
