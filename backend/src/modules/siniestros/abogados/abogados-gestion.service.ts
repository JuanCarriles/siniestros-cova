import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { AbogadoFichaData, ParteCreada } from '@cova/shared/schemas/partes-siniestro'
import { HttpError } from '../../../utils/httpError.ts'
import { eventoHistorial } from '../../historial/historial.textos.ts'
import { datosAbogado } from '../partes-datos.ts'
import { camposCambiados, prepararEdicion, type Transaccion, type Tx } from '../partes-edicion.ts'

/** Cómo se nombra cada dato en el historial cuando cambia */
const ETIQUETAS: Record<keyof ReturnType<typeof datosAbogado>, string> = {
  nombreCompleto: 'nombre',
  numeroMatricula: 'matrícula',
  telefono: 'teléfono',
  email: 'email',
}

/** "Ana Ruiz y Juan Paz", "Ana Ruiz y 2 personas sin nombre" */
function nombresRepresentados(personas: { nombreCompletoRazonSocial: string | null }[]) {
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

/** ¿Representa a alguien en otro siniestro? */
const representaEnOtros = async (tx: Tx, idSiniestro: number, idAbogado: number) =>
  (await tx.personaInvolucrada.count({
    where: { idAbogado, eliminado: false, idSiniestro: { not: idSiniestro } },
  })) > 0

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
        const { id } = await tx.abogado.create({ data: datosAbogado(datos), select: { id: true } })
        await tx.personaInvolucrada.updateMany({
          where: { id: { in: personas.map((p) => p.id) } },
          data: { idAbogado: id },
        })
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
      datos: AbogadoFichaData,
    ) {
      await transaccion(async (tx) => {
        const autor = await prepararEdicion(tx, usuario, idSiniestro)
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
        if (campos.length === 0) return

        // Si también figura en otro siniestro, los datos nuevos son solo de este: una copia para sus personas
        let destino = idAbogado
        if (cambiaContacto) {
          if (await representaEnOtros(tx, idSiniestro, idAbogado))
            destino = (await tx.abogado.create({ data: nuevos, select: { id: true } })).id
          else await tx.abogado.update({ where: { id: idAbogado }, data: nuevos })
        }
        const ids = elegidas.map((p) => p.id)
        await tx.personaInvolucrada.updateMany({
          where: { idAbogado, idSiniestro, eliminado: false, id: { notIn: ids } },
          data: { idAbogado: null },
        })
        await tx.personaInvolucrada.updateMany({
          where: { id: { in: ids } },
          data: { idAbogado: destino },
        })
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
