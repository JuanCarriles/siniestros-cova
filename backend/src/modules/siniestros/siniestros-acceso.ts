import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'

export type BaseAcceso = Pick<Prisma.TransactionClient, 'siniestro'>

/**
 * E4-03 y CU-10 1.j: un gestor solo abre los siniestros asignados a él (RF-17), y nunca uno dado de baja. Si existe
 * pero no le corresponde, error de permisos (403); el administrador y el superadministrador abren cualquiera.
 * La usan la ficha y cada una de sus pestañas.
 */
export async function exigirAccesoSiniestro(
  prisma: BaseAcceso,
  usuario: SesionUsuario,
  id: number,
): Promise<void> {
  const fila = await prisma.siniestro.findUnique({
    where: { id },
    select: { idUsuario: true, eliminado: true, eliminacionEnCurso: true },
  })
  if (!fila) throw new HttpError(404, 'El siniestro no existe.')
  if (fila.eliminacionEnCurso)
    throw new HttpError(
      403,
      'Este siniestro tiene una eliminación definitiva pendiente. Un administrador puede reintentarla desde el listado.',
    )
  if (usuario.tipoUsuario !== 'GESTOR') return
  if (fila.idUsuario !== usuario.id) {
    throw new HttpError(403, 'Este siniestro no está asignado a vos.')
  }
  if (fila.eliminado) throw new HttpError(403, 'Este siniestro está dado de baja.')
}
