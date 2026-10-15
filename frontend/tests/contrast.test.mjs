import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const css = await readFile(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')
const tokens = Object.fromEntries(
  [...css.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
)
function color(name, visited = new Set()) {
  assert.ok(!visited.has(name), `Referencia circular: ${name}`)
  visited.add(name)
  const value = tokens[name]
  assert.ok(value, `Falta el token ${name}`)
  const alias = /^var\(--color-([\w-]+)\)$/.exec(value)
  if (alias) return color(alias[1], visited)
  assert.match(value, /^#[\da-f]{6}$/i)
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
}
function luminance(rgb) {
  const linear = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}
function contrast(a, b) {
  const x = luminance(color(a))
  const y = luminance(color(b))
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
test('texto principal supera 7:1 y texto secundario/estados superan 4.5:1', () => {
  assert.ok(contrast('foreground', 'background') >= 7)
  for (const [fg, bg] of [
    ['foreground', 'card'],
    ['muted-foreground', 'background'],
    ['muted-foreground', 'card'],
    ['primary-foreground', 'primary'],
    ['on-navy', 'navy-hover'],
    ['on-navy', 'navy-active'],
    ['on-navy-muted', 'navy'],
    ['foreground', 'brand-accent'],
    ['destructive-foreground', 'destructive'],
    ['on-navy', 'danger-hover'],
    ['info-ink', 'info-bg'],
    ['ok-ink', 'ok-bg'],
    ['warning-ink', 'warning-bg'],
    ['danger-ink', 'danger-bg'],
    ['neutral-ink', 'neutral-bg'],
    ['destructive', 'surface'],
    ['owner-ink', 'owner-bg'],
    ['injury-ink', 'injury-bg'],
    ['document-image-ink', 'document-image-bg'],
  ])
    assert.ok(contrast(fg, bg) >= 4.5, `${fg}/${bg}: ${contrast(fg, bg).toFixed(2)}:1`)
})
test('bordes de controles y foco superan 3:1 sobre superficies claras', () => {
  for (const bg of ['surface', 'page', 'surface-subtle']) {
    for (const fg of ['input', 'ring']) assert.ok(contrast(fg, bg) >= 3, `${fg}/${bg}`)
  }
})
