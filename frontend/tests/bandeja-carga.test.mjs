import assert from 'node:assert/strict'
import test from 'node:test'
import { cargarBandeja } from '../src/features/notificaciones/operaciones-bandeja.ts'
import { destinoNotificacion } from '../src/features/notificaciones/tipos.ts'

const datos = () => ({
  total: 2,
  totalGeneral: 2,
  sinLeer: 2,
  sinRevisar: 2,
  pagina: 1,
  porPagina: 20,
  items: [
    { id: 1, leida: false },
    { id: 2, leida: false },
  ],
})

test('bandeja: falla el marcado al entrar, pero se consulta la lista; Actualizar reintenta y conserva revisión', async () => {
  const llamadas = []
  let falla = true
  const api = {
    leer: async (pedido) => {
      llamadas.push(['leer', pedido])
      if (falla) throw new Error('Red')
    },
    consultar: async (query) => {
      llamadas.push(['consultar', query])
      return datos()
    },
  }
  const primero = await cargarBandeja(
    'revision=pendientes',
    'todas',
    true,
    new AbortController().signal,
    api,
  )
  assert.equal(primero.datos.items.length, 2)
  assert.equal(primero.entradaLeida, false)
  assert.match(primero.avisoLectura, /No se pudieron marcar/)
  assert.deepEqual(llamadas, [
    ['leer', { todas: true }],
    ['consultar', 'revision=pendientes'],
  ])
  falla = false
  const segundo = await cargarBandeja(
    'revision=pendientes',
    'todas',
    !primero.entradaLeida,
    new AbortController().signal,
    api,
  )
  assert.equal(segundo.entradaLeida, true)
  assert.equal(segundo.avisoLectura, null)
  llamadas.length = 0
  await cargarBandeja('', 'todas', !segundo.entradaLeida, new AbortController().signal, api)
  assert.deepEqual(
    llamadas,
    [['consultar', '']],
    'un marcado manual posterior no se revierte al refrescar',
  )
})

test('desplegable: solo marca los IDs recibidos y muestra los avisos aunque falle el marcado', async () => {
  const pedidos = []
  const api = {
    consultar: async () => datos(),
    leer: async (pedido) => {
      pedidos.push(pedido)
    },
  }
  const uno = await cargarBandeja(
    'lectura=sin-leer',
    'visibles',
    true,
    new AbortController().signal,
    api,
  )
  assert.deepEqual(pedidos, [{ ids: [1, 2] }])
  assert.equal(uno.datos.sinLeer, 0)
  assert.ok(uno.datos.items.every((n) => n.leida))
  const dos = await cargarBandeja(
    'lectura=sin-leer',
    'visibles',
    true,
    new AbortController().signal,
    {
      ...api,
      leer: async () => {
        throw new Error('Red')
      },
    },
  )
  assert.equal(dos.datos.items.length, 2)
  assert.ok(dos.datos.items.every((n) => !n.leida))
  assert.match(dos.avisoLectura, /abrir el panel/)
})

test('una carga cancelada no consulta ni modifica la pantalla después del aborto', async () => {
  const controlador = new AbortController()
  let consultas = 0
  await assert.rejects(
    cargarBandeja('', 'todas', true, controlador.signal, {
      leer: async () => {
        controlador.abort()
        throw new Error('Cancelado')
      },
      consultar: async () => {
        consultas++
        return datos()
      },
    }),
    (error) => error.name === 'AbortError',
  )
  assert.equal(consultas, 0)
})

test('cada tipo abre la pestaña que corresponde al aviso', () => {
  const destinos = {
    MENSAJE_NUEVO: '/chat',
    NOVEDAD_CARGADA: '/novedades',
    DOCUMENTO_NUEVO: '/documentos',
    CAMBIO_ESTADO: '/historial',
    ASIGNACION_SINIESTRO: '',
    REASIGNACION_SINIESTRO: '',
    CASO_DEMORADO: '',
    CASO_EN_ALERTA: '',
  }
  for (const [tipo, sufijo] of Object.entries(destinos))
    assert.equal(destinoNotificacion('', tipo, 42), '/siniestros/42' + sufijo)
  assert.equal(destinoNotificacion('/gestor', 'MENSAJE_NUEVO', 42), '/gestor/siniestros/42/chat')
})
