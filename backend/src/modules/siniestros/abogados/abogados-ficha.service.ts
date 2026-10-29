import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { AbogadoFicha } from '@cova/shared/schemas/ficha-siniestro'
import type { Prisma } from '../../../generated/prisma/client.ts'
import { nombreOpcional } from '../ficha.ts'
import { exigirAccesoSiniestro } from '../siniestros-acceso.ts'

type Base = Pick<Prisma.TransactionClient, 'siniestro' | 'abogado'>

// CU-10 1.d (E5-01): los abogados del siniestro con sus datos de contacto y a quiénes representan. Un abogado está
// en el siniestro porque representa a alguna de sus personas.
export function crearServicioAbogadosFicha(prisma: Base) {
  return {
    async listar(usuario: SesionUsuario, idSiniestro: number): Promise<AbogadoFicha[]> {
      await exigirAccesoSiniestro(prisma, usuario, idSiniestro)
      const representados = { idSiniestro, eliminado: false }
      const filas = await prisma.abogado.findMany({
        where: { eliminado: false, personasInvolucradas: { some: representados } },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          nombreCompleto: true,
          numeroMatricula: true,
          telefono: true,
          email: true,
          personasInvolucradas: {
            where: representados,
            orderBy: { id: 'asc' },
            select: { id: true, nombreCompletoRazonSocial: true },
          },
        },
      })
      return filas.map(({ personasInvolucradas, ...a }) => ({
        ...a,
        representa: personasInvolucradas.map((p) => ({ id: p.id, nombre: nombreOpcional(p) })),
      }))
    },
  }
}
