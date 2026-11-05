import { createRequire } from 'node:module'
import { dirname, join, basename } from 'node:path'
import { readdirSync, readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

/** Recursos de PDF.js locales en desarrollo y build: nunca enviar expedientes a un visor externo. */
export function recursosPdf(): Plugin {
  const raiz = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
  const recursos = new Map<string, Buffer>()
  for (const carpeta of ['cmaps', 'standard_fonts', 'wasm'])
    for (const archivo of readdirSync(join(raiz, carpeta), { withFileTypes: true }))
      if (archivo.isFile())
        recursos.set(
          `pdf-recursos/${carpeta}/${basename(archivo.name)}`,
          readFileSync(join(raiz, carpeta, archivo.name)),
        )
  return {
    name: 'recursos-pdf-locales',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const datos = recursos.get(new URL(req.url || '/', 'http://localhost').pathname.slice(1))
        if (!datos) return next()
        res.setHeader(
          'Content-Type',
          req.url?.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
        )
        res.end(datos)
      })
    },
    generateBundle() {
      for (const [fileName, source] of recursos) this.emitFile({ type: 'asset', fileName, source })
    },
  }
}
