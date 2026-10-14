import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { leerConfiguracionR2 } from '../../config/r2.ts'
import { crearAlmacenamientoR2 } from '../../lib/r2.ts'
import { crearAppDemo } from './app.ts'
import { abrirRegistroDemo } from './registro.ts'

const puerto = 3033
let almacenamiento: ReturnType<typeof crearAlmacenamientoR2> | undefined
try {
  if (process.env.NODE_ENV === 'production') throw new Error('Esta interfaz desechable sólo funciona en desarrollo.')
  const config = leerConfiguracionR2()
  almacenamiento = crearAlmacenamientoR2(config)
  const ruta = fileURLToPath(new URL('../../../.r2-demo/archivos.json', import.meta.url))
  const registro = await abrirRegistroDemo(ruta, almacenamiento)
  const app = crearAppDemo({ almacenamiento, registro, config, puerto, token: randomBytes(32).toString('hex') })
  const servidor = app.listen(puerto, '127.0.0.1', () => {
    console.log(`Prueba de archivos R2: http://127.0.0.1:${puerto}`)
    console.log('Los archivos se conservan hasta que uses Eliminar de R2. Ctrl+C detiene la interfaz.')
  })
  servidor.on('error', () => {
    console.error(`No se pudo abrir el puerto ${puerto}. Si ya hay una demo abierta, usá esa ventana o detenela.`)
    almacenamiento?.cerrar()
    process.exitCode = 1
  })
  function cerrar() {
    servidor.close(() => { almacenamiento?.cerrar(); process.exit(0) })
    setTimeout(() => process.exit(1), 35_000).unref()
  }
  process.once('SIGINT', cerrar)
  process.once('SIGTERM', cerrar)
} catch (error) {
  // Los errores de configuración y registro se redactan sin incluir valores secretos.
  console.error(error instanceof Error ? error.message : 'No se pudo iniciar la demo de R2.')
  almacenamiento?.cerrar()
  process.exitCode = 1
}
