import assert from 'node:assert/strict'
import test from 'node:test'
import { parametrosListadoValidos } from '../../shared/src/schemas/siniestros.ts'

// La pantalla del listado muestra los filtros aplicados a partir de esta función, la misma que arma la consulta al
// servidor: lo que se ve como aplicado es exactamente lo que se envió (E4-02).
const validos = (consulta) => parametrosListadoValidos(new URLSearchParams(consulta))

test('conserva los filtros válidos y descarta los demás', () => {
  assert.deepEqual(validos('q=gomez&estado=3&aseguradora=2&gestor=5&bajas=true&orden=demora'), {
    q: 'gomez',
    estado: '3',
    aseguradora: '2',
    gestor: '5',
    bajas: 'true',
    orden: 'demora',
  })
  assert.deepEqual(validos('estado=abc&porPagina=30&orden=nombre&inventado=1&pagina=0'), {})
})

test('una búsqueda de más de 100 caracteres no se envía ni se muestra como aplicada', () => {
  assert.deepEqual(validos(`q=${'x'.repeat(101)}`), {})
  assert.equal(validos(`q=${'x'.repeat(100)}`).q, 'x'.repeat(100))
})

test('un id que no está en el catálogo sí se envía: la pantalla lo muestra como "no disponible"', () => {
  assert.deepEqual(validos('estado=999999'), { estado: '999999' })
})
