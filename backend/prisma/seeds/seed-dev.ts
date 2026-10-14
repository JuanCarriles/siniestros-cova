// Seed de DESARROLLO: aplica la seed base y después carga datos ficticios
// (usuarios de prueba, aseguradoras, ajustadores, abogados, plantillas y siniestros completos).
//   npm run seed:dev -w backend
//
// Para volver a empezar de cero: npm run db:reset:dev -w backend
// (borra la base de desarrollo, aplica las migraciones y corre esta seed).
import { hashPassword } from '../../src/lib/password.ts'
import { disconnectPrisma, getPrisma } from '../../src/lib/prisma.ts'
import { seedBase } from './base.ts'
import { seedDesarrollo, USUARIOS_DEV } from './desarrollo.ts'

try {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('La seed de desarrollo no puede correr con NODE_ENV=production.')
  }

  const prisma = getPrisma()
  const yaCargada = await prisma.usuario.findUnique({ where: { email: USUARIOS_DEV[0].email } })

  if (yaCargada) {
    // Igual se asegura de que los catálogos estén completos
    await prisma.$transaction((tx) => seedBase(tx))
    console.log('Los datos de desarrollo ya estaban cargados: no se agregó nada nuevo.')
    console.log('Para recargarlos desde cero: npm run db:reset:dev -w backend')
  } else {
    // El hash es lento a propósito (Argon2): se calcula antes de abrir la transacción
    const hashes = new Map(
      await Promise.all(
        USUARIOS_DEV.map(async (u) => [u.email, await hashPassword(u.contrasena)] as const),
      ),
    )

    const { base, dev } = await prisma.$transaction(
      async (tx) => ({ base: await seedBase(tx), dev: await seedDesarrollo(tx, hashes) }),
      { timeout: 60_000 },
    )

    console.log('Seed de desarrollo aplicada.')
    console.log(
      `  Base (nuevos): ${base.provincias} provincias, ${base.estados} estados, ${base.tiposDocumento} tipos de documento`,
    )
    console.log(
      `  Datos de prueba: ${dev.usuarios} usuarios, ${dev.aseguradoras} aseguradoras, ${dev.ajustadores} ajustadores, ${dev.abogados} abogados, ${dev.siniestros} siniestros`,
    )
    console.log('\n  Usuarios de prueba (contraseñas en prisma/seeds/desarrollo.ts):')
    for (const u of USUARIOS_DEV) console.log(`    ${u.tipoUsuario.padEnd(20)} ${u.email}`)
  }
} catch (err) {
  console.error('La seed de desarrollo falló; no se guardó ningún cambio.\n', err)
  process.exitCode = 1
} finally {
  await disconnectPrisma()
}
