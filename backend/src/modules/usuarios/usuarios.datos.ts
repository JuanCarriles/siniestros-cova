import type { Prisma } from '../../generated/prisma/client.ts'
import type { UsuarioAltaData } from '@cova/shared/schemas/usuarios-abm'
import { usosDeDireccion } from '../../lib/direcciones.ts'
import { HttpError } from '../../utils/httpError.ts'

export type TransaccionUsuarios = Pick<
  Prisma.TransactionClient,
  'usuario' | 'direccion' | 'provincia' | 'sesion' | 'recuperacionContrasena'
>

export async function exigirEmailLibre(tx: TransaccionUsuarios, email: string, excepto?: number) {
  const existente = await tx.usuario.findFirst({
    where: {
      email: { equals: email, mode: 'insensitive' },
      ...(excepto ? { id: { not: excepto } } : {}),
    },
    select: { id: true },
  })
  if (existente)
    throw new HttpError(
      409,
      'Ya existe un usuario con ese email, incluso entre los dados de baja.',
      {
        campo: 'email',
      },
    )
}

export async function exigirProvincia(
  tx: TransaccionUsuarios,
  idProvincia: number,
  anterior?: number | null,
) {
  if (idProvincia === anterior) return
  const provincia = await tx.provincia.findFirst({
    where: { id: idProvincia, eliminado: false, pais: { eliminado: false } },
    select: { id: true },
  })
  if (!provincia)
    throw new HttpError(409, 'La provincia elegida ya no está disponible. Elegí otra.', {
      campo: 'direccion.idProvincia',
    })
}

// Copia una dirección compartida para no modificar los datos de otro registro.
export async function guardarDireccion(
  tx: TransaccionUsuarios,
  id: number,
  direccion: UsuarioAltaData['direccion'],
) {
  const usos = await usosDeDireccion(tx, id)
  const compartida = usos.usuarios > 1 || usos.siniestros > 0 || usos.perito || usos.persona
  return compartida
    ? tx.direccion.create({ data: direccion, select: { id: true } })
    : tx.direccion.update({ where: { id }, data: direccion, select: { id: true } })
}
