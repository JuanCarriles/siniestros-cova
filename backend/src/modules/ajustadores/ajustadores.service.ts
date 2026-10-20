import type {
  AjustadorData,
  AjustadorUpdateData,
  BloqueoBajaAjustador,
} from '@cova/shared/schemas/ajustadores'
import type { Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'

type BaseAjustadores = Pick<Prisma.TransactionClient, 'ajustador' | 'aseguradora'>

// Siniestro activo: no eliminado y en un estado que no es el de cierre (la regla usa la bandera, no el nombre)
const siniestroActivo = {
  eliminado: false,
  estadoSiniestro: { esCierre: false },
} satisfies Prisma.SiniestroWhereInput

const sinSiniestrosActivos = {
  siniestros: { none: siniestroActivo },
} satisfies Prisma.AjustadorWhereInput

const detalle = {
  id: true,
  nombres: true,
  apellidos: true,
  email: true,
  telefono: true,
  eliminado: true,
  fechaBaja: true,
  aseguradora: { select: { id: true, nombre: true, eliminado: true } },
  _count: { select: { siniestros: { where: siniestroActivo } } },
} as const satisfies Prisma.AjustadorSelect

type FilaPrisma = Prisma.AjustadorGetPayload<{ select: typeof detalle }>

function aListado({ _count, ...fila }: FilaPrisma) {
  return { ...fila, casosActivos: _count.siniestros }
}

const siniestros = (cantidad: number) =>
  cantidad === 1 ? '1 siniestro activo' : `${cantidad} siniestros activos`

// CU-03: alta, modificación, baja lógica y reactivación de ajustadores.
export function crearServicioAjustadores(prisma: BaseAjustadores) {
  // Sin distinguir mayúsculas y contando también los dados de baja, como el nombre de las aseguradoras
  async function exigirEmailLibre(email: string, excepto?: number) {
    const otro = await prisma.ajustador.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        ...(excepto ? { id: { not: excepto } } : {}),
      },
      select: { eliminado: true },
    })
    if (otro) {
      throw new HttpError(
        409,
        otro.eliminado
          ? 'Ya existe un ajustador dado de baja con ese email. Podés reactivarlo desde el listado con «Mostrar dados de baja».'
          : 'Ya existe un ajustador con ese email.',
        { campo: 'email' },
      )
    }
  }

  // CU-03 paso 4: solo se elige entre las aseguradoras activas
  async function exigirAseguradoraActiva(idAseguradora: number) {
    const aseguradora = await prisma.aseguradora.findUnique({
      where: { id: idAseguradora },
      select: { eliminado: true },
    })
    if (!aseguradora || aseguradora.eliminado) {
      throw new HttpError(
        409,
        'La aseguradora elegida ya no está activa. Elegí otra de la lista.',
        { campo: 'idAseguradora' },
      )
    }
  }

  async function buscar(id: number) {
    const fila = await prisma.ajustador.findUnique({ where: { id }, select: detalle })
    if (!fila) throw new HttpError(404, 'El ajustador no existe.')
    return fila
  }

  function bloqueoCambioAseguradora(actual: FilaPrisma) {
    return new HttpError(
      409,
      `Tiene ${siniestros(actual._count.siniestros)} de ${actual.aseguradora.nombre}. Reasignalos a otro ajustador antes de cambiarlo de aseguradora.`,
      { campo: 'idAseguradora' },
    )
  }

  return {
    async listar(incluirBajas: boolean) {
      const filas = await prisma.ajustador.findMany({
        where: incluirBajas ? {} : { eliminado: false },
        select: detalle,
        orderBy: [{ eliminado: 'asc' }, { apellidos: 'asc' }, { nombres: 'asc' }, { id: 'asc' }],
      })
      return filas.map(aListado)
    },

    async crear(datos: AjustadorData) {
      await exigirEmailLibre(datos.email)
      await exigirAseguradoraActiva(datos.idAseguradora)
      return aListado(await prisma.ajustador.create({ data: datos, select: detalle }))
    },

    // CU-03 3.b. Cambiar de aseguradora solo sin siniestros activos: si no, esos siniestros quedarían con una
    // aseguradora y un ajustador que no coinciden.
    async modificar(id: number, datos: AjustadorUpdateData) {
      const actual = await buscar(id)
      if (actual.eliminado) {
        throw new HttpError(409, 'El ajustador está dado de baja. Reactivalo para modificarlo.')
      }
      if (datos.email !== undefined) await exigirEmailLibre(datos.email, id)
      const cambiaAseguradora =
        datos.idAseguradora !== undefined && datos.idAseguradora !== actual.aseguradora.id
      if (cambiaAseguradora) {
        if (actual._count.siniestros > 0) throw bloqueoCambioAseguradora(actual)
        await exigirAseguradoraActiva(datos.idAseguradora!)
      }
      // La condición va en la misma sentencia: si mientras tanto le asignaron un siniestro, no se cambia
      const resultado = await prisma.ajustador.updateMany({
        where: { id, eliminado: false, ...(cambiaAseguradora ? sinSiniestrosActivos : {}) },
        data: datos,
      })
      if (resultado.count === 0) {
        const ahora = await buscar(id)
        if (ahora.eliminado) {
          throw new HttpError(409, 'El ajustador está dado de baja. Reactivalo para modificarlo.')
        }
        throw bloqueoCambioAseguradora(ahora)
      }
      return aListado(await buscar(id))
    },

    // CU-03 3.a. El predicado y la baja se ejecutan en una sola sentencia: no confiar en un conteo previo.
    async darDeBaja(id: number) {
      const resultado = await prisma.ajustador.updateMany({
        where: { id, eliminado: false, ...sinSiniestrosActivos },
        data: { eliminado: true, fechaBaja: new Date() },
      })
      if (resultado.count === 1) return
      const actual = await buscar(id)
      if (actual.eliminado) throw new HttpError(409, 'El ajustador ya está dado de baja.')
      const casos = actual._count.siniestros
      if (casos > 0) {
        const bloqueo: BloqueoBajaAjustador = {
          codigo: 'AJUSTADOR_CON_SINIESTROS',
          idAjustador: actual.id,
          nombreAjustador: `${actual.nombres} ${actual.apellidos}`,
          casosActivos: casos,
        }
        throw new HttpError(
          409,
          `No se puede dar de baja: tiene ${siniestros(casos)}. Asignalos a otro ajustador antes de darlo de baja.`,
          bloqueo,
        )
      }
      throw new HttpError(
        409,
        'Los datos del ajustador cambiaron. Actualizá el listado e intentá nuevamente.',
      )
    },

    // CU-03 3.c. Con la aseguradora dada de baja no puede volver: quedaría activo en una aseguradora inactiva.
    async reactivar(id: number) {
      const actual = await buscar(id)
      if (!actual.eliminado) throw new HttpError(409, 'El ajustador ya está activo.')
      if (actual.aseguradora.eliminado) {
        throw new HttpError(
          409,
          `Su aseguradora, ${actual.aseguradora.nombre}, está dada de baja. Reactivala primero desde Aseguradoras.`,
        )
      }
      await prisma.ajustador.update({ where: { id }, data: { eliminado: false, fechaBaja: null } })
    },
  }
}
