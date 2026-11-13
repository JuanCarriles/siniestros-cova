import { HttpError } from '../utils/httpError.ts'
import { parseArgs } from 'node:util'
import { entornoR2Schema } from '../lib/rutas-r2.ts'
import { crearAlmacenamientoR2 } from '../lib/r2.ts'
import { getPrisma, disconnectPrisma } from '../lib/prisma.ts'
import { reorganizarArchivosR2 } from '../modules/documentos/reorganizar-r2.service.ts'

const { values } = parseArgs({
  options: { entorno: { type: 'string' }, aplicar: { type: 'boolean', default: false } },
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
  console.log(JSON.stringify(resultado))
  if (!values.aplicar)
    console.log(
      'SIMULACIÓN: no se cambió ningún dato ni archivo. Revisá el resultado antes de usar --aplicar.',
    )
  else
    console.log(
      'Referencias actualizadas. Los originales se conservan por compatibilidad; no se borraron objetos de otro entorno.',
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
