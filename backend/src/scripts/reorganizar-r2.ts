import { HttpError } from '../utils/httpError.ts'
import { parseArgs } from 'node:util'
import { entornoR2Schema } from '../lib/rutas-r2.ts'
import { crearAlmacenamientoR2 } from '../lib/r2.ts'
import { getPrisma, disconnectPrisma } from '../lib/prisma.ts'
import { reorganizarArchivosR2 } from '../modules/documentos/reorganizar-r2.service.ts'

const { values } = parseArgs({
  options: {
    entorno: { type: 'string' },
    aplicar: { type: 'boolean', default: false },
    'listar-sobrantes': { type: 'boolean', default: false },
  },
  strict: true,
  allowPositionals: false,
})
if (!values.entorno)
  throw new Error(
    'Indicá --entorno=dev o --entorno=produccion. Sin --aplicar solo se simula, sin copiar ni cambiar la base.',
  )
const entorno = entornoR2Schema.parse(values.entorno)
if (process.env.R2_ENTORNO !== entorno)
  throw new Error(
    'Definí R2_ENTORNO en el .env del servidor y usá el mismo valor en --entorno. Revisá también DATABASE_URL y R2_BUCKET.',
  )
const r2 = crearAlmacenamientoR2()
try {
  const resultado = await reorganizarArchivosR2({
    db: getPrisma(),
    r2,
    entorno,
    aplicar: values.aplicar,
    progreso: (c) => console.log(JSON.stringify(c)),
  })
  const { sobrantes, ...resumen } = resultado
  console.log(JSON.stringify(resumen))
  // Sobrantes: lo que ninguna referencia de la base usa. No se borra nada: se retira a mano desde Cloudflare.
  const porCarpeta = new Map<string, { archivos: number; bytes: number }>()
  for (const o of sobrantes) {
    const partes = o.clave.split('/')
    const nivel = partes[0] === 'dev' || partes[0] === 'produccion' ? 3 : 2
    const carpeta = partes.slice(0, Math.min(nivel, partes.length - 1)).join('/') || '(raíz)'
    const c = porCarpeta.get(carpeta) ?? { archivos: 0, bytes: 0 }
    c.archivos++
    c.bytes += o.bytes
    porCarpeta.set(carpeta, c)
  }
  console.log(
    sobrantes.length
      ? `SOBRANTES: ${sobrantes.length} archivo(s) que la base no usa (no se borró ninguno):`
      : 'SOBRANTES: ninguno.',
  )
  for (const [carpeta, c] of [...porCarpeta].sort())
    console.log(`  ${carpeta}/  ${c.archivos} archivo(s), ${(c.bytes / 1024 / 1024).toFixed(2)} MB`)
  if (values['listar-sobrantes']) for (const o of sobrantes) console.log(`sobrante: ${o.clave}`)
  else if (sobrantes.length) console.log('  Para ver cada archivo, agregá --listar-sobrantes.')
  if (!values.aplicar)
    console.log(
      'SIMULACIÓN: no se cambió ningún dato ni archivo. Revisá el resultado antes de usar --aplicar.',
    )
  else
    console.log(
      'Referencias actualizadas. Los archivos anteriores se conservan y ahora figuran como sobrantes: retiralos desde Cloudflare cuando verifiques que la app y el backup del día funcionan con la organización nueva.',
    )
} catch (error) {
  if (error instanceof HttpError) console.error(error.message)
  console.error(
    'No se pudo completar la reorganización. Los originales se conservaron. Revisá el entorno, la conectividad y los registros indicados por la simulación; se puede reintentar.',
  )
  process.exitCode = 1
} finally {
  r2.cerrar()
  await disconnectPrisma()
}
