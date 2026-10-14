import { defineConfig } from 'tsdown'

// Compila el backend a dist/server.mjs. Las dependencias de npm quedan externas (se instalan en la imagen),
// pero @cova/shared se incluye dentro del bundle porque se publica como código TypeScript sin compilar.
// dist/seed-base.mjs: la seed de catálogos, para correrla en producción con node (la imagen no tiene tsx).
export default defineConfig({
  entry: {
    server: 'src/server.ts',
    'seed-base': 'prisma/seeds/seed-base.ts',
  },
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outDir: 'dist',
  sourcemap: true,
  dts: false,
  deps: {
    alwaysBundle: ['@cova/shared'],
  },
})
