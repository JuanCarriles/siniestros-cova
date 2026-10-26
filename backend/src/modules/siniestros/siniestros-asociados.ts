import { SINIESTROS_ASOCIADOS_POR_PAGINA } from '@cova/shared/schemas/siniestros-asociados'
import type { Prisma } from '../../generated/prisma/client.ts'

// La detección, el detalle y la condición de baja comparten exactamente la misma regla.
export const siniestroActivoAsociado = {
  eliminado: false,
  estadoSiniestro: { esCierre: false },
} satisfies Prisma.SiniestroWhereInput

const detalle = {
  id: true,
  numeroSiniestro: true,
  aseguradora: { select: { nombre: true } },
  estadoSiniestro: { select: { nombre: true } },
} as const satisfies Prisma.SiniestroSelect

export function seleccionSiniestrosActivos(pagina: number) {
  return {
    _count: { select: { siniestros: { where: siniestroActivoAsociado } } },
    siniestros: {
      where: siniestroActivoAsociado,
      select: detalle,
      orderBy: { id: 'asc' as const },
      skip: (pagina - 1) * SINIESTROS_ASOCIADOS_POR_PAGINA,
      take: SINIESTROS_ASOCIADOS_POR_PAGINA,
    },
  } as const
}

export function paginaSiniestrosActivos(
  fila: {
    _count: { siniestros: number }
    siniestros: Prisma.SiniestroGetPayload<{ select: typeof detalle }>[]
  },
  pagina: number,
) {
  return {
    casosActivos: fila._count.siniestros,
    pagina,
    porPagina: SINIESTROS_ASOCIADOS_POR_PAGINA,
    siniestros: fila.siniestros.map((caso) => ({
      id: caso.id,
      numeroSiniestro: caso.numeroSiniestro,
      aseguradora: caso.aseguradora.nombre,
      estado: caso.estadoSiniestro.nombre,
    })),
  }
}
