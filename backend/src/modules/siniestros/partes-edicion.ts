import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { RegistroDesactualizado } from '@cova/shared/schemas/partes-siniestro'
import { normalizarDocumento, normalizarDominio } from '@cova/shared/schemas/siniestros-alta'
import type { Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'
import { exigirAccesoSiniestro } from './siniestros-acceso.ts'
import type { TipoPersona } from './partes-datos.ts'

// Reglas comunes para agregar, modificar y dar de baja vehículos y personas (CU-10 1.c, E5-06), abogados y peritos
// (1.d y 1.e, E5-07) desde la ficha.

export type Tx = Prisma.TransactionClient
export type Transaccion = <T>(trabajo: (tx: Tx) => Promise<T>) => Promise<T>

/**
 * Antes de cualquier cambio: el acceso de la ficha (el gestor, solo sus casos) y que el siniestro se pueda tocar.
 * Uno dado de baja o cerrado se consulta pero no se modifica. Devuelve quién hace el cambio, para el historial.
 *
 * Bloquea la fila del siniestro hasta el final de la transacción: los cambios de partes de un mismo siniestro se
 * hacen de a uno. Así lo que se controla (dominio y documento sin repetir, un titular por vehículo, un vehículo sin
 * personas antes de su baja) sigue valiendo al guardar, aunque dos usuarios confirmen a la vez.
 */
export async function prepararEdicion(tx: Tx, usuario: SesionUsuario, idSiniestro: number) {
  await exigirAccesoSiniestro(tx, usuario, idSiniestro)
  await tx.$queryRaw`SELECT "id" FROM "Siniestro" WHERE "id" = ${idSiniestro} FOR UPDATE`
  const siniestro = await tx.siniestro.findUniqueOrThrow({
    where: { id: idSiniestro },
    select: { eliminado: true, estadoSiniestro: { select: { esCierre: true } } },
  })
  if (siniestro.eliminado)
    throw new HttpError(
      409,
      'Este siniestro está dado de baja: se puede consultar, pero no modificar.',
    )
  if (siniestro.estadoSiniestro.esCierre)
    throw new HttpError(409, 'Este siniestro está cerrado: se puede consultar, pero no modificar.')
  const autor = await tx.usuario.findFirst({
    where: { id: usuario.id, eliminado: false },
    select: { nombres: true, apellidos: true },
  })
  if (!autor) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
  return autor
}

/**
 * Cuenta como movimiento del caso: reinicia los días sin movimiento (RF-19). Desde la ficha, de vehículos, personas,
 * abogados y peritos solo lo hace registrar el cierre de una pericia (E5-07); lo demás queda en el historial.
 */
export async function registrarMovimiento(tx: Tx, idSiniestro: number, fecha: Date) {
  await tx.siniestro.update({
    where: { id: idSiniestro },
    data: { fechaUltimoMovimiento: fecha },
  })
}

/**
 * El formulario se abrió con la revisión `abierta`: si el registro se modificó después, guardarlo pisaría ese cambio
 * sin que nadie lo note. Se rechaza; lo escrito sigue en el formulario.
 */
export function exigirRevision(actual: number, abierta: number, que: string) {
  if (actual === abierta) return
  const detalle: RegistroDesactualizado = { codigo: 'REGISTRO_DESACTUALIZADO', revision: actual }
  throw new HttpError(
    409,
    `Otra persona modificó ${que} mientras lo editabas. Lo que escribiste sigue en el formulario: si guardás de nuevo, reemplaza esos cambios; si cancelás, ves la versión actual.`,
    detalle,
  )
}

/** Los catálogos elegidos tienen que seguir activos. Solo se controlan los que cambiaron. */
export async function exigirCatalogos(
  tx: Tx,
  ids: {
    idAseguradora?: number | null
    idProvincia?: number | null
    idTipoDocumento?: number | null
  },
) {
  if (
    ids.idAseguradora &&
    !(await tx.aseguradora.count({ where: { id: ids.idAseguradora, eliminado: false } }))
  )
    throw new HttpError(400, 'La aseguradora elegida ya no está disponible. Elegí otra.', {
      campo: 'idAseguradora',
    })
  if (
    ids.idProvincia &&
    !(await tx.provincia.count({
      where: { id: ids.idProvincia, eliminado: false, pais: { eliminado: false } },
    }))
  )
    throw new HttpError(400, 'La provincia elegida ya no está disponible. Elegí otra.', {
      campo: 'domicilio.idProvincia',
    })
  if (
    ids.idTipoDocumento &&
    !(await tx.tipoDocumento.count({ where: { id: ids.idTipoDocumento, eliminado: false } }))
  )
    throw new HttpError(400, 'El tipo de documento elegido ya no está disponible. Elegí otro.', {
      campo: 'idTipoDocumento',
    })
}

/** CU-09 9.a: el mismo dominio no puede estar dos veces entre los vehículos activos del siniestro */
export async function exigirDominioLibre(
  tx: Tx,
  idSiniestro: number,
  dominio: string,
  excepto: number | null = null,
) {
  const buscado = normalizarDominio(dominio)
  const vehiculos = await tx.vehiculo.findMany({
    where: { idSiniestro, eliminado: false, ...(excepto ? { id: { not: excepto } } : {}) },
    select: { dominio: true },
  })
  if (vehiculos.some((v) => normalizarDominio(v.dominio) === buscado))
    throw new HttpError(
      409,
      `El vehículo con dominio ${dominio} ya está cargado en este siniestro`,
      {
        campo: 'dominio',
      },
    )
}

/** CU-09 13.b y 16.a: el mismo documento no puede estar en dos personas activas del siniestro */
export async function exigirDocumentoLibre(
  tx: Tx,
  idSiniestro: number,
  documento: string | null | undefined,
  excepto: number | null = null,
) {
  const buscado = normalizarDocumento(documento ?? '')
  if (!buscado) return
  const personas = await tx.personaInvolucrada.findMany({
    where: {
      idSiniestro,
      eliminado: false,
      documento: { not: null },
      ...(excepto ? { id: { not: excepto } } : {}),
    },
    select: { documento: true },
  })
  if (personas.some((p) => normalizarDocumento(p.documento ?? '') === buscado))
    throw new HttpError(409, 'Esa persona ya está cargada en este siniestro', {
      campo: 'documento',
    })
}

const comparable = (valor: unknown) =>
  valor instanceof Date ? valor.toISOString() : (valor ?? null)

/**
 * Qué campos cambiaron entre lo guardado y lo nuevo, con su nombre para el historial ("color", "daños"). Varias
 * columnas pueden ser un mismo campo (tipo y número de documento = "documento"): se nombra una vez.
 */
export function camposCambiados<C extends string>(
  antes: object,
  despues: object,
  etiquetas: Record<C, string>,
): string[] {
  const a = antes as Partial<Record<C, unknown>>
  const d = despues as Partial<Record<C, unknown>>
  const cambiados = new Set<string>()
  for (const columna of Object.keys(etiquetas) as C[])
    if (comparable(a[columna]) !== comparable(d[columna])) cambiados.add(etiquetas[columna])
  return [...cambiados]
}

/** "Ana Ruiz" o, sin nombre cargado, "una persona sin nombre" */
export const nombreParaHistorial = (nombre: string | null) =>
  nombre?.trim() || 'una persona sin nombre'

/** "titular del vehículo AE123CD", "ocupante del vehículo AE123CD", "testigo" */
export function rolParaHistorial(
  tipo: TipoPersona,
  dominio: string | null,
  rolSinVehiculo: string | null,
) {
  if (tipo === 'externa')
    return rolSinVehiculo?.trim().toLocaleLowerCase('es') || 'persona fuera de los vehículos'
  return `${tipo === 'titular' ? 'titular' : 'ocupante'} del vehículo ${dominio ?? ''}`.trim()
}
