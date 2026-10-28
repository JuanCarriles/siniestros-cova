import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { EventoHistorialFicha } from '@cova/shared/schemas/ficha-siniestro'
import type { Prisma } from '../../generated/prisma/client.ts'
import { nombreDe } from '../siniestros/ficha.ts'
import { exigirAccesoSiniestro } from '../siniestros/siniestros-acceso.ts'

type Base = Pick<Prisma.TransactionClient, 'siniestro' | 'historialSiniestro'>

// CU-10 1.i (E5-01): los eventos del siniestro en orden cronológico, con su tipo, descripción, quién lo generó y
// cuándo. La descripción ya viene armada (historial.textos.ts).
export function crearServicioHistorialFicha(prisma: Base) {
  return {
    async listar(usuario: SesionUsuario, idSiniestro: number): Promise<EventoHistorialFicha[]> {
      await exigirAccesoSiniestro(prisma, usuario, idSiniestro)
      const filas = await prisma.historialSiniestro.findMany({
        where: { idSiniestro, eliminado: false },
        orderBy: [{ fechaEvento: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          tipoEvento: true,
          descripcion: true,
          fechaEvento: true,
          usuario: { select: { nombres: true, apellidos: true, tipoUsuario: true } },
        },
      })
      return filas.map((e) => ({
        id: e.id,
        tipo: e.tipoEvento,
        descripcion: e.descripcion,
        fecha: e.fechaEvento.toISOString(),
        usuario: { nombre: nombreDe(e.usuario), tipoUsuario: e.usuario.tipoUsuario },
      }))
    },
  }
}
