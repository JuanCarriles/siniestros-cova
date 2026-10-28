import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { NovedadFicha } from '@cova/shared/schemas/ficha-siniestro'
import type { Prisma } from '../../generated/prisma/client.ts'
import { exigirAccesoSiniestro } from '../siniestros/siniestros-acceso.ts'

type Base = Pick<Prisma.TransactionClient, 'siniestro' | 'novedadSiniestro'>

// CU-10 1.f (E5-01): las novedades del siniestro en orden cronológico, con su autor y su fecha y hora
export function crearServicioNovedadesFicha(prisma: Base) {
  return {
    async listar(usuario: SesionUsuario, idSiniestro: number): Promise<NovedadFicha[]> {
      await exigirAccesoSiniestro(prisma, usuario, idSiniestro)
      const filas = await prisma.novedadSiniestro.findMany({
        where: { idSiniestro, eliminado: false },
        orderBy: [{ fechaCarga: 'asc' }, { id: 'asc' }],
        select: { id: true, descripcion: true, autor: true, fechaCarga: true },
      })
      return filas.map((n) => ({ ...n, fechaCarga: n.fechaCarga.toISOString() }))
    },
  }
}
