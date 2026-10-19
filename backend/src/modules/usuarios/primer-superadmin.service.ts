import { emailSchema, textoSchema } from '@cova/shared/schemas/comunes'
import type { Prisma } from '../../generated/prisma/client.ts'
import { hashPassword } from '../../lib/password.ts'

type BaseUsuarios = Pick<Prisma.TransactionClient, 'usuario' | 'direccion'>

// Crea el primer superadministrador de producción (la base arranca sin usuarios). Documento y teléfono quedan como
// PENDIENTE y la dirección vacía: se corrigen después desde "Mi perfil" (CU-07). No hace nada si ya hay uno activo.
// Correrlo dentro de una transacción, para que la dirección y el usuario se creen juntos o ninguno.
export async function crearPrimerSuperadmin(
  prisma: BaseUsuarios,
  datos: { email: string; nombres: string; apellidos: string; contrasena: string },
) {
  const email = emailSchema.parse(datos.email).toLowerCase()
  const existente = await prisma.usuario.findFirst({
    where: {
      OR: [
        { tipoUsuario: 'SUPER_ADMINISTRADOR', eliminado: false },
        { email: { equals: email, mode: 'insensitive' } },
      ],
    },
    select: { email: true },
  })
  if (existente)
    throw new Error(`Ya existe un superadministrador o ese email (${existente.email}).`)

  const direccion = await prisma.direccion.create({ data: {}, select: { id: true } })
  return prisma.usuario.create({
    data: {
      email,
      nombres: textoSchema.parse(datos.nombres),
      apellidos: textoSchema.parse(datos.apellidos),
      documento: 'PENDIENTE',
      telefono: 'PENDIENTE',
      contrasena: await hashPassword(datos.contrasena),
      tipoUsuario: 'SUPER_ADMINISTRADOR',
      idDireccion: direccion.id,
    },
    select: { email: true },
  })
}
