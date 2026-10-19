import type { AseguradoraData, AseguradoraUpdateData } from '@cova/shared/schemas/aseguradoras'
import type { Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'

type BaseAseguradoras = Pick<Prisma.TransactionClient, 'aseguradora'>

// Solo los ajustadores activos cuentan: los dados de baja no impiden dar de baja la aseguradora
const detalle = {
  id: true,
  nombre: true,
  eliminado: true,
  fechaBaja: true,
  _count: { select: { ajustadores: { where: { eliminado: false } } } },
} as const

type FilaPrisma = {
  id: number
  nombre: string
  eliminado: boolean
  fechaBaja: Date | null
  _count: { ajustadores: number }
}

function aListado({ _count, ...fila }: FilaPrisma) {
  return { ...fila, cantidadAjustadores: _count.ajustadores }
}

// CU-02: alta, modificación, baja lógica y reactivación de aseguradoras.
export function crearServicioAseguradoras(prisma: BaseAseguradoras) {
  // "No puede repetirse" (mockup): sin distinguir mayúsculas y contando también las dadas de baja, para que no
  // convivan "Sancor" activa y "SANCOR" dada de baja
  async function exigirNombreLibre(nombre: string, excepto?: number) {
    const otra = await prisma.aseguradora.findFirst({
      where: {
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excepto ? { id: { not: excepto } } : {}),
      },
      select: { eliminado: true },
    })
    if (otra) {
      throw new HttpError(
        409,
        otra.eliminado
          ? 'Ya existe una aseguradora dada de baja con ese nombre. Podés reactivarla desde el listado con «Mostrar dadas de baja».'
          : 'Ya existe una aseguradora con ese nombre.',
      )
    }
  }

  async function buscar(id: number) {
    const fila = await prisma.aseguradora.findUnique({ where: { id }, select: detalle })
    if (!fila) throw new HttpError(404, 'La aseguradora no existe.')
    return fila
  }

  return {
    async listar(incluirBajas: boolean) {
      const filas = await prisma.aseguradora.findMany({
        where: incluirBajas ? {} : { eliminado: false },
        select: detalle,
        orderBy: [{ eliminado: 'asc' }, { nombre: 'asc' }, { id: 'asc' }],
      })
      return filas.map(aListado)
    },

    async crear(datos: AseguradoraData) {
      await exigirNombreLibre(datos.nombre)
      return aListado(await prisma.aseguradora.create({ data: datos, select: detalle }))
    },

    async modificar(id: number, datos: AseguradoraUpdateData) {
      const actual = await buscar(id)
      if (actual.eliminado) {
        throw new HttpError(409, 'La aseguradora está dada de baja. Reactivala para modificarla.')
      }
      if (datos.nombre !== undefined) await exigirNombreLibre(datos.nombre, id)
      return aListado(
        await prisma.aseguradora.update({ where: { id }, data: datos, select: detalle }),
      )
    },

    // CU-02 3.a: solo sin ajustadores activos. Sus siniestros y vehículos se conservan.
    async darDeBaja(id: number) {
      const actual = await buscar(id)
      if (actual.eliminado) throw new HttpError(409, 'La aseguradora ya está dada de baja.')
      const cantidad = actual._count.ajustadores
      if (cantidad > 0) {
        throw new HttpError(
          409,
          `No se puede dar de baja: tiene ${cantidad} ${cantidad === 1 ? 'ajustador activo' : 'ajustadores activos'}. Primero dalos de baja o pasalos a otra aseguradora.`,
        )
      }
      await prisma.aseguradora.update({
        where: { id },
        data: { eliminado: true, fechaBaja: new Date() },
      })
    },

    // CU-02 3.c
    async reactivar(id: number) {
      const actual = await buscar(id)
      if (!actual.eliminado) throw new HttpError(409, 'La aseguradora ya está activa.')
      await prisma.aseguradora.update({
        where: { id },
        data: { eliminado: false, fechaBaja: null },
      })
    },
  }
}
