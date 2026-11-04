import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ARCHIVO_MAX_BYTES,
  ARCHIVO_REQUISITOS,
  errorSeleccionArchivo,
} from '../../shared/src/schemas/archivos.ts'
import { errorArchivoDocumento } from '../../shared/src/schemas/documentos.ts'
import { errorArchivoPlantilla } from '../../shared/src/schemas/plantillas.ts'

test('selección: todos los rechazos de formato, vacío y tamaño explican las reglas; el máximo exacto se permite', () => {
  for (const validar of [errorSeleccionArchivo, errorArchivoDocumento, errorArchivoPlantilla]) {
    for (const archivo of [
      { name: 'vacio.pdf', size: 0 },
      { name: 'grande.pdf', size: ARCHIVO_MAX_BYTES + 1 },
      { name: 'pagina.html', size: 100 },
      { name: 'negativo.pdf', size: -1 },
      { name: 'infinito.pdf', size: Infinity },
    ])
      assert.ok(validar(archivo).includes(ARCHIVO_REQUISITOS))
    for (const ext of ['pdf', 'jpg', 'JPEG', 'png', 'docx', 'xlsx'])
      assert.equal(validar({ name: `archivo.${ext}`, size: ARCHIVO_MAX_BYTES }), null)
  }
})
