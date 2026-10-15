import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import type { AlmacenamientoR2, ArchivoEntrada } from '../../lib/r2.ts'
import { HttpError } from '../../utils/httpError.ts'

const archivoSchema = z.strictObject({
  id: z.uuid(),
  clave: z.string().regex(/^pruebas\/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png|docx|xlsx)$/),
  nombreOriginal: z.string().min(1).max(255),
  tamanoBytes: z.string().regex(/^\d+$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  fechaCarga: z.iso.datetime(),
})
const registroSchema = z.strictObject({
  version: z.literal(1),
  archivos: z.array(archivoSchema).max(50),
})
export type ArchivoDemo = z.output<typeof archivoSchema>

// Registro exclusivo de esta demo. No lista ni permite borrar otros objetos del bucket.
export async function abrirRegistroDemo(ruta: string, almacenamiento: AlmacenamientoR2) {
  let archivos: ArchivoDemo[] = []
  try {
    archivos = registroSchema.parse(JSON.parse(await readFile(ruta, 'utf8'))).archivos
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      throw new Error(
        'No se pudo leer el registro local de la demo. Conservá el archivo para revisar sus claves.',
        { cause: error },
      )
    }
  }
  let cola = Promise.resolve()
  function exclusivo<T>(trabajo: () => Promise<T>): Promise<T> {
    const resultado = cola.then(trabajo)
    cola = resultado.then(
      () => {},
      () => {},
    )
    return resultado
  }
  async function guardar(siguientes: ArchivoDemo[]) {
    await mkdir(dirname(ruta), { recursive: true })
    const temporal = `${ruta}.tmp`
    await writeFile(temporal, JSON.stringify({ version: 1, archivos: siguientes }, null, 2), {
      mode: 0o600,
    })
    await rename(temporal, ruta)
    archivos = siguientes
  }
  function buscar(id: string) {
    const archivo = archivos.find((item) => item.id === id)
    if (!archivo) throw new HttpError(404, 'Archivo de prueba no encontrado')
    return { ...archivo }
  }
  return {
    listar: () => archivos.map((archivo) => ({ ...archivo })),
    buscar,
    subir: (entrada: ArchivoEntrada) =>
      exclusivo(async () => {
        if (archivos.length >= 50)
          throw new HttpError(409, 'Eliminá algún archivo: la demo admite hasta 50 archivos.')
        const subido = await almacenamiento.subir(entrada, 'pruebas')
        const archivo = archivoSchema.parse({
          id: randomUUID(),
          clave: subido.clave,
          nombreOriginal: subido.nombreOriginal,
          tamanoBytes: subido.tamanoBytes.toString(),
          sha256: createHash('sha256').update(entrada.contenido).digest('hex'),
          fechaCarga: new Date().toISOString(),
        })
        try {
          await guardar([...archivos, archivo])
        } catch {
          try {
            await almacenamiento.eliminar(archivo.clave)
          } catch {
            console.error('Objeto de demo pendiente de limpieza:', archivo.clave)
          }
          throw new HttpError(
            500,
            'No se pudo guardar el registro local. Revisá los permisos de la carpeta backend/.r2-demo.',
          )
        }
        return archivo
      }),
    eliminar: (id: string) =>
      exclusivo(async () => {
        const archivo = buscar(id)
        await almacenamiento.eliminar(archivo.clave)
        await guardar(archivos.filter((item) => item.id !== id))
      }),
  }
}
export type RegistroDemo = Awaited<ReturnType<typeof abrirRegistroDemo>>
