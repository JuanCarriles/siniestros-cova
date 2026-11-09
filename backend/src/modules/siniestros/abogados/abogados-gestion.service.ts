import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type {
  AbogadoFichaData,
  ModificarAbogado,
  ParteCreada,
} from '@cova/shared/schemas/partes-siniestro'
import { HttpError } from '../../../utils/httpError.ts'
import { eventoHistorial } from '../../historial/historial.textos.ts'
import { datosAbogado } from '../partes-datos.ts'
import {
  camposCambiados,
  exigirRevision,
  prepararEdicion,
  type Transaccion,
  type Tx,
} from '../partes-edicion.ts'

/** Cómo se nombra cada dato en el historial cuando cambia */
const ETIQUETAS: Record<keyof ReturnType<typeof datosAbogado>, string> = {
  nombreCompleto: 'nombre',
  numeroMatricula: 'matrícula',
  telefono: 'teléfono',
  email: 'email',
}

/** "Ana Ruiz y Juan Paz", "Ana Ruiz y 2 personas sin nombre". También la usa el alta del siniestro (E5-09). */
export function nombresRepresentados(personas: { nombreCompletoRazonSocial: string | null }[]) {
  const nombres = personas.flatMap((p) => p.nombreCompletoRazonSocial?.trim() || [])
  const sinNombre = personas.length - nombres.length
  if (sinNombre === 1) nombres.push('una persona sin nombre')
  if (sinNombre > 1) nombres.push(`${sinNombre} personas sin nombre`)
  return nombres
}

/** Las personas elegidas tienen que seguir activas en el siniestro */
async function exigirRepresentados(tx: Tx, idSiniestro: number, ids: number[]) {
  const unicos = [...new Set(ids)]
  const personas = await tx.personaInvolucrada.findMany({
    where: { id: { in: unicos }, idSiniestro, eliminado: false },
    orderBy: { id: 'asc' },
    select: { id: true, nombreCompletoRazonSocial: true },
  })
  if (personas.length !== unicos.length)
    throw new HttpError(
      409,
      'Alguna de las personas elegidas ya no está en el siniestro. Actualizá la página.',
      { campo: 'representados' },
    )
  return personas
}

/** Un abogado está en el siniestro mientras represente a alguna de sus personas activas */
async function buscarAbogado(tx: Tx, idSiniestro: number, idAbogado: number) {
  const abogado = await tx.abogado.findFirst({
    where: {
      id: idAbogado,
      eliminado: false,
      personasInvolucradas: { some: { idSiniestro, eliminado: false } },
    },
  })
  if (!abogado)
    throw new HttpError(404, 'Ese abogado ya no está en el siniestro. Actualizá la página.')
  return abogado
}

/**
 * Un abogado puede figurar en varios siniestros, y el bloqueo de cada siniestro no ordena los cambios que llegan
 * desde fichas distintas: se bloquean también sus filas, en un solo pedido y por orden de id, hasta el final de la
 * transacción. Así la baja ve lo que se guardó en los otros siniestros: dos bajas a la vez desde fichas distintas no
 * dejan activo a un abogado que ya no representa a nadie.
 */
async function bloquearAbogados(tx: Tx, ids: (number | null)[]) {
  const unicos = [...new Set(ids)].filter((id): id is number => id !== null).sort((a, b) => a - b)
  if (unicos.length)
    await tx.$queryRaw`SELECT "id" FROM "Abogado" WHERE "id" = ANY(${unicos}) ORDER BY "id" FOR UPDATE`
}

/** Quién representa hoy a las personas del siniestro elegidas */
const abogadosDe = async (tx: Tx, idSiniestro: number, ids: number[]) =>
  (
    await tx.personaInvolucrada.findMany({
      where: { id: { in: ids }, idSiniestro },
      select: { idAbogado: true },
    })
  ).map((p) => p.idAbogado)

/** ¿Representa a alguien en otro siniestro? */
const representaEnOtros = async (tx: Tx, idSiniestro: number, idAbogado: number) =>
  (await tx.personaInvolucrada.count({
    where: { idAbogado, eliminado: false, idSiniestro: { not: idSiniestro } },
  })) > 0

/**
 * Las personas elegidas pasan al abogado `destino`. Los abogados que las representaban cambian a quién representan:
 * su revisión sube, para que un formulario suyo abierto antes no las devuelva sin aviso.
 */
async function pasarRepresentados(tx: Tx, ids: number[], destino: number) {
  const anteriores = await tx.personaInvolucrada.findMany({
    where: { id: { in: ids }, idAbogado: { not: null } },
    select: { idAbogado: true },
  })
  const otros = [...new Set(anteriores.map((p) => p.idAbogado))].filter(
    (id): id is number => id !== null && id !== destino,
  )
  if (otros.length)
    await tx.abogado.updateMany({
      where: { id: { in: otros } },
      data: { revision: { increment: 1 } },
    })
  await tx.personaInvolucrada.updateMany({
    where: { id: { in: ids } },
    data: { idAbogado: destino },
  })
}

// CU-10 1.d (E5-07): abogados desde la ficha, con las reglas del alta. Cada persona tiene a lo sumo un abogado: las
// que se eligen dejan al que tenían. Un mismo abogado puede figurar en varios siniestros: lo que se cambia desde la
// ficha de uno no toca a los demás. Cada cambio queda en el historial; no cuenta como movimiento del caso.
export function crearServicioAbogadosGestion({ transaccion }: { transaccion: Transaccion }) {
  return {
    async agregar(
      usuario: SesionUsuario,
      idSiniestro: number,
      datos: AbogadoFichaData,
    ): Promise<ParteCreada> {
      return transaccion(async (tx) => {
        const autor = await prepararEdicion(tx, usuario, idSiniestro)
        const personas = await exigirRepresentados(tx, idSiniestro, datos.representados)
        const ids = personas.map((p) => p.id)
        await bloquearAbogados(tx, await abogadosDe(tx, idSiniestro, ids))
        const { id } = await tx.abogado.create({ data: datosAbogado(datos), select: { id: true } })
        await pasarRepresentados(tx, ids, id)
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            ...eventoHistorial.abogadoAgregado(
              autor,
              datos.nombreCompleto,
              nombresRepresentados(personas),
              new Date(),
            ),
          },
        })
        return { id }
      })
    },

    async modificar(
      usuario: SesionUsuario,
      idSiniestro: number,
      idAbogado: number,
      { revision, datos }: ModificarAbogado,
    ) {
      await transaccion(async (tx) => {
        const autor = await prepararEdicion(tx, usuario, idSiniestro)
        await bloquearAbogados(tx, [
          idAbogado,
          ...(await abogadosDe(tx, idSiniestro, datos.representados)),
        ])
        const actual = await buscarAbogado(tx, idSiniestro, idAbogado)
        const representaba = await tx.personaInvolucrada.findMany({
          where: { idAbogado, idSiniestro, eliminado: false },
          select: { id: true },
        })
        const elegidas = await exigirRepresentados(tx, idSiniestro, datos.representados)
        const antes = new Set(representaba.map((p) => p.id))
        const cambiaRepresentados =
          antes.size !== elegidas.length || elegidas.some((p) => !antes.has(p.id))

        const nuevos = datosAbogado(datos)
        const campos = camposCambiados(actual, nuevos, ETIQUETAS)
        const cambiaContacto = campos.length > 0
        if (cambiaRepresentados) campos.push('a quién representa')
        // Sin diferencias con lo guardado no pisa nada, aunque el formulario sea viejo
        if (campos.length === 0) return
        exigirRevision(actual.revision, revision, `los datos del abogado ${actual.nombreCompleto}`)

        // Si también figura en otro siniestro, los datos nuevos son solo de este: una copia para sus personas
        let destino = idAbogado
        if (cambiaContacto && (await representaEnOtros(tx, idSiniestro, idAbogado)))
          destino = (await tx.abogado.create({ data: nuevos, select: { id: true } })).id
        else
          await tx.abogado.update({
            where: { id: idAbogado },
            data: { ...(cambiaContacto ? nuevos : {}), revision: { increment: 1 } },
          })
        const ids = elegidas.map((p) => p.id)
        await tx.personaInvolucrada.updateMany({
          where: { idAbogado, idSiniestro, eliminado: false, id: { notIn: ids } },
          data: { idAbogado: null },
        })
        await pasarRepresentados(tx, ids, destino)
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            // Con el nombre de antes: si cambió, el historial dice de quién era el dato
            ...eventoHistorial.abogadoModificado(autor, actual.nombreCompleto, campos, new Date()),
          },
        })
      })
    },

    // Sus personas de este siniestro quedan sin abogado. Si no representa a nadie en otro, se da de baja también.
    async darDeBaja(usuario: SesionUsuario, idSiniestro: number, idAbogado: number) {
      await transaccion(async (tx) => {
        const autor = await prepararEdicion(tx, usuario, idSiniestro)
        await bloquearAbogados(tx, [idAbogado])
        const actual = await buscarAbogado(tx, idSiniestro, idAbogado)
        await tx.personaInvolucrada.updateMany({
          where: { idAbogado, idSiniestro, eliminado: false },
          data: { idAbogado: null },
        })
        if (!(await representaEnOtros(tx, idSiniestro, idAbogado)))
          await tx.abogado.update({
            where: { id: idAbogado },
            data: { eliminado: true, fechaBaja: new Date() },
          })
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            ...eventoHistorial.abogadoDadoDeBaja(autor, actual.nombreCompleto, new Date()),
          },
        })
      })
    },
  }
}
