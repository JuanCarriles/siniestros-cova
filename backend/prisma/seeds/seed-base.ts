// Seed de producción y desarrollo: país, provincias, estados de siniestro y tipos de documento.
//   Desarrollo:  npm run seed:base -w backend
//   Producción:  node dist/seed-base.mjs   (dentro del contenedor del backend)
import { disconnectPrisma, getPrisma } from '../../src/lib/prisma.ts'
import { seedBase } from './base.ts'

try {
  const r = await getPrisma().$transaction((tx) => seedBase(tx))
  console.log('Seed base aplicada (registros nuevos):')
  console.log(`  País Argentina:        ${r.pais}`)
  console.log(`  Provincias:            ${r.provincias}`)
  console.log(`  Estados de siniestro:  ${r.estados}`)
  console.log(`  Tipos de documento:    ${r.tiposDocumento}`)
} catch (err) {
  console.error('La seed base falló; no se guardó ningún cambio.\n', err)
  process.exitCode = 1
} finally {
  await disconnectPrisma()
}
