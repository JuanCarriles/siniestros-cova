import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { NovedadFicha } from '@cova/shared/schemas/ficha-siniestro'
import type { Prisma } from '../../generated/prisma/client.ts'
import { nombreDe } from '../siniestros/ficha.ts'
import { exigirAccesoSiniestro } from '../siniestros/siniestros-acceso.ts'

type Base = Pick<Prisma.TransactionClient, 'siniestro' | 'novedadSiniestro'>

// CU-10 1.f (E5-01): las novedades del siniestro con su autor, su tipo de usuario y su fecha y hora. De la más nueva
// a la más vieja (E5-08): la recién cargada queda junto al campo de carga.
export function crearServicioNovedadesFicha(prisma: Base) {
  return {
    async listar(usuario: SesionUsuario, idSiniestro: number): Promise<NovedadFicha[]> {
      await exigirAccesoSiniestro(prisma, usuario, idSiniestro)
      const filas = await prisma.novedadSiniestro.findMany({
        where: { idSiniestro, eliminado: false },
        orderBy: [{ fechaCarga: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          descripcion: true,
          fechaCarga: true,
          usuario: { select: { nombres: true, apellidos: true, tipoUsuario: true } },
        },
      })
      return filas.map(({ usuario: autor, ...n }) => ({
        ...n,
        fechaCarga: n.fechaCarga.toISOString(),
        autor: { nombre: nombreDe(autor), tipoUsuario: autor.tipoUsuario },
      }))
    },
  }
}
