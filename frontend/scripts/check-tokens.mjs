import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Se revisa el código de interfaz; los SVG/imagenes y el archivo de tokens no son pantallas.
const extensions = new Set(['.tsx', '.ts', '.jsx', '.js', '.css', '.html'])
const patterns = [
  { name: 'color hexadecimal', regex: /#[\da-f]{8}\b|#[\da-f]{6}\b|#[\da-f]{4}\b|#[\da-f]{3}\b/gi },
  {
    name: 'color literal',
    regex: /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(\s*(?!var\()[\d.#]/gi,
  },
  {
    name: 'paleta fuera de los tokens',
    regex:
      /\b(?:bg|text|border|ring|outline|fill|stroke|decoration|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)\b/g,
  },
  {
    name: 'color sin token',
    regex: /\b(?:bg|text|border|ring|outline|fill|stroke)-(?:white|black)\b/g,
  },
]

export function findColorLiterals(source) {
  return patterns.flatMap(({ name, regex }) =>
    [...source.matchAll(regex)].map((match) => ({
      line: source.slice(0, match.index).split('\n').length,
      value: match[0],
      reason: name,
    })),
  )
}

export async function checkTokens(root) {
  const findings = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && extensions.has(extname(path))) await inspect(path)
    }
  }
  async function inspect(path) {
    const name = relative(root, path).replaceAll('\\', '/')
    if (name === 'src/styles/tokens.css') return
    const source = await readFile(path, 'utf8')
    findings.push(...findColorLiterals(source).map((item) => ({ file: name, ...item })))
  }
  await visit(join(root, 'src'))
  await inspect(join(root, 'index.html'))
  return findings
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  try {
    const findings = await checkTokens(root)
    for (const item of findings)
      console.error(`${item.file}:${item.line} — ${item.reason}: ${item.value}`)
    if (findings.length) {
      console.error('Usá los tokens de src/styles/tokens.css en componentes y pantallas.')
      process.exitCode = 1
    } else console.log('Tokens: no hay colores directos en componentes ni pantallas.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'No se pudo revisar el uso de tokens.')
    process.exitCode = 1
  }
}
