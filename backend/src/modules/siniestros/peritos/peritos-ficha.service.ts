import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { PeritoFicha } from '@cova/shared/schemas/ficha-siniestro'
import type { Prisma } from '../../../generated/prisma/client.ts'
import { exigirAccesoSiniestro } from '../siniestros-acceso.ts'

type Base = Pick<Prisma.TransactionClient, 'siniestro' | 'perito'>

// CU-10 1.e (E5-01): los peritos del siniestro con su tipo, contacto, fecha de solicitud y de cierre
export function crearServicioPeritosFicha(prisma: Base) {
  return {
    async listar(usuario: SesionUsuario, idSiniestro: number): Promise<PeritoFicha[]> {
      await exigirAccesoSiniestro(prisma, usuario, idSiniestro)
      const filas = await prisma.perito.findMany({
        where: { idSiniestro, eliminado: false },
        orderBy: [{ tipoPerito: 'asc' }, { fechaSolicitud: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          tipoPerito: true,
          nombre: true,
          telefono: true,
          email: true,
          fechaSolicitud: true,
          fechaCierre: true,
          cerrado: true,
        },
      })
      return filas.map(({ tipoPerito, fechaSolicitud, fechaCierre, ...p }) => ({
        ...p,
        tipo: tipoPerito,
        fechaSolicitud: fechaSolicitud.toISOString(),
        fechaCierre: fechaCierre?.toISOString() ?? null,
      }))
    },
  }
}
