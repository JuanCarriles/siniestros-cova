// Crea el primer superadministrador de producción con una contraseña al azar, que se muestra una sola vez.
//   VPS:        docker compose exec backend node dist/crear-superadmin.mjs EMAIL "NOMBRES" "APELLIDOS"
//   Desarrollo: npm run crear-superadmin -w backend -- EMAIL "NOMBRES" "APELLIDOS"
import { randomBytes } from 'node:crypto'
import { disconnectPrisma, getPrisma } from '../lib/prisma.ts'
import { crearPrimerSuperadmin } from '../modules/usuarios/primer-superadmin.service.ts'

const [email, nombres, apellidos] = process.argv.slice(2)
if (!email || !nombres || !apellidos) {
  console.error('Uso: node dist/crear-superadmin.mjs EMAIL "NOMBRES" "APELLIDOS"')
  process.exit(1)
}

// 16 caracteres al azar más una mayúscula y un número, para cumplir cualquier regla de contraseña que se agregue
const contrasena = `${randomBytes(12).toString('base64url')}A7`

try {
  const usuario = await getPrisma().$transaction((tx) =>
    crearPrimerSuperadmin(tx, { email, nombres, apellidos, contrasena }),
  )
  console.log(`Superadministrador creado: ${usuario.email}`)
  console.log(`Contraseña: ${contrasena}`)
  console.log('Guardala ahora en el gestor de contraseñas: no se vuelve a mostrar.')
} catch (err) {
  console.error('No se creó:', err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  await disconnectPrisma()
}
