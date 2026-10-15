import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { checkTokens, findColorLiterals } from '../scripts/check-tokens.mjs'

test('detecta hexadecimales de 3, 4, 6 y 8 dígitos, incluidos colores arbitrarios de Tailwind', () => {
  for (const value of ['#fff', '#abcd', '#1E3A5F', '#11223344']) {
    assert.equal(findColorLiterals(`className="bg-[${value}]"`)[0].value, value)
  }
})
test('detecta colores RGB/HSL y la paleta predeterminada que evita el tema', () => {
  for (const value of [
    'rgb(10 20 30)',
    'hsl(120 10% 20%)',
    'oklch(0.5 0.2 30)',
    'text-red-500',
    'hover:bg-blue-950',
    'text-white',
  ]) {
    assert.ok(findColorLiterals(value).length > 0, value)
  }
})
test('permite tokens, colores derivados de variables y anclas con nombres', () => {
  assert.deepEqual(
    findColorLiterals(
      'bg-primary text-primary-foreground hover:bg-navy-hover var(--color-info-bg) rgb(var(--theme)) href="#botones"',
    ),
    [],
  )
})
test('revisa pantallas, componentes e index.html, exceptuando únicamente tokens y recursos SVG', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'cova-tokens-'))
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()))
    assert.ok(basename(root).startsWith('cova-tokens-'))
    await rm(root, { recursive: true, force: true })
  })
  await mkdir(join(root, 'src/styles'), { recursive: true })
  await mkdir(join(root, 'src/components'), { recursive: true })
  await writeFile(join(root, 'src/styles/tokens.css'), '@theme { --color-primary: #1e3a5f; }')
  await writeFile(join(root, 'src/styles/otro.css'), 'body { color: #123456; }')
  await writeFile(join(root, 'src/components/card.tsx'), '\n<div className="bg-[#fff]" />')
  await writeFile(join(root, 'src/icon.svg'), '<svg fill="#fff" />')
  await writeFile(join(root, 'index.html'), '<meta name="theme-color" content="#123456">')
  const findings = await checkTokens(root)
  assert.deepEqual(findings.map((item) => item.file).sort(), [
    'index.html',
    'src/components/card.tsx',
    'src/styles/otro.css',
  ])
  assert.equal(findings.find((item) => item.file.endsWith('.tsx')).line, 2)
})
