import { defineConfig } from 'tsdown'

// Compila el backend a dist/server.mjs. Las dependencias de npm quedan externas (se instalan en la imagen),
// pero @cova/shared se incluye dentro del bundle porque se publica como código TypeScript sin compilar.
// Con una expresión regular, para incluir también sus subrutas (@cova/shared/schemas/auth…): la imagen final no
// tiene el código de shared, y un import que quede afuera hace caer el backend al arrancar.
// dist/seed-base.mjs: la seed de catálogos, para correrla en producción con node (la imagen no tiene tsx).
// dist/crear-superadmin.mjs: crea el primer superadministrador en producción (DEPLOY.md, sección 4).
export default defineConfig({
  entry: {
    server: 'src/server.ts',
    'seed-base': 'prisma/seeds/seed-base.ts',
    'crear-superadmin': 'src/scripts/crear-superadmin.ts',
  },
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outDir: 'dist',
  sourcemap: true,
  dts: false,
  deps: {
    alwaysBundle: [/^@cova\/shared(\/|$)/],
  },
})
