import { defineConfig } from 'tsdown'

// Compila el backend a dist/server.mjs. Las dependencias de npm quedan externas (se instalan en la imagen),
// pero @cova/shared se incluye dentro del bundle porque se publica como código TypeScript sin compilar.
export default defineConfig({
  entry: ['src/server.ts'],
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
