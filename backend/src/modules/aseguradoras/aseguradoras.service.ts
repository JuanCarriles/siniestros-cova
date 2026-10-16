import type { PrismaClient } from '../../generated/prisma/client.ts'
import type { AseguradoraData, AseguradoraUpdateData } from '@cova/shared/schemas/aseguradoras'
import { HttpError } from '../../utils/httpError.ts'

export function crearServicioAseguradoras(prisma: PrismaClient) {
  const detalle = {
    id: true,
    nombre: true,
    eliminado: true,
    fechaBaja: true,
    _count: { select: { ajustadores: { where: { eliminado: false } } } },
  } as const

  return {
    async listar(incluirBajas: boolean) {
      const filas = await prisma.aseguradora.findMany({
        where: incluirBajas ? {} : { eliminado: false },
        select: detalle,
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
      })
      return filas.map(({ _count, ...fila }) => ({
        ...fila,
        cantidadAjustadores: _count.ajustadores,
      }))
    },
    async crear(datos: AseguradoraData) {
      const { _count, ...fila } = await prisma.aseguradora.create({ data: datos, select: detalle })
      return { ...fila, cantidadAjustadores: _count.ajustadores }
    },
    async modificar(id: number, datos: AseguradoraUpdateData) {
      const resultado = await prisma.aseguradora.updateMany({
        where: { id, eliminado: false },
        data: datos,
      })
      if (!resultado.count) throw new HttpError(404, 'La aseguradora activa no existe')
      const { _count, ...fila } = await prisma.aseguradora.findUniqueOrThrow({
        where: { id },
        select: detalle,
      })
      return { ...fila, cantidadAjustadores: _count.ajustadores }
    },
    async darDeBaja(id: number) {
      const resultado = await prisma.aseguradora.updateMany({
        where: { id, eliminado: false },
        data: { eliminado: true, fechaBaja: new Date() },
      })
      if (!resultado.count) throw new HttpError(404, 'La aseguradora activa no existe')
    },
    async reactivar(id: number) {
      const resultado = await prisma.aseguradora.updateMany({
        where: { id, eliminado: true },
        data: { eliminado: false, fechaBaja: null },
      })
      if (!resultado.count) throw new HttpError(404, 'La aseguradora dada de baja no existe')
    },
  }
}
