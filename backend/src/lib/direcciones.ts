import type { Prisma } from '../generated/prisma/client.ts'

/**
 * Quiénes usan una dirección. La base permite que una misma fila esté vinculada a varios registros (un usuario y
 * una persona, por ejemplo): antes de corregirla en su lugar, cada módulo comprueba que solo la use el suyo y, si
 * no, guarda una copia (usuarios, perfil y personas del siniestro).
 */
export async function usosDeDireccion(tx: Pick<Prisma.TransactionClient, 'direccion'>, id: number) {
  const direccion = await tx.direccion.findUniqueOrThrow({
    where: { id },
    select: {
      _count: { select: { usuarios: true, siniestros: true } },
      perito: { select: { id: true } },
      personaInvolucrada: { select: { id: true } },
    },
  })
  return {
    usuarios: direccion._count.usuarios,
    siniestros: direccion._count.siniestros,
    perito: direccion.perito !== null,
    persona: direccion.personaInvolucrada !== null,
  }
}
