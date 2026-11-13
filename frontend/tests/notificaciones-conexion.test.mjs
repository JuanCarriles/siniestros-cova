import assert from 'node:assert/strict'
import test from 'node:test'
import { registerHooks } from 'node:module'

test('Una sola conexión personal persiste sin chats y comparte las salas, se recupera y se libera', async (t) => {
  const originalWindow = globalThis.window,
    originalDocument = globalThis.document
  globalThis.window = new EventTarget()
  globalThis.window.location = { assign: () => {} }
  globalThis.document = new EventTarget()
  globalThis.document.visibilityState = 'visible'
  const creados = []
  globalThis.__covaSocketPrueba = () => {
    const callbacks = new Map(),
      s = {
        connected: false,
        active: true,
        emisiones: [],
        conexiones: 0,
        cortes: 0,
        on(evento, fn) {
          const lista = callbacks.get(evento) ?? new Set()
          lista.add(fn)
          callbacks.set(evento, lista)
          return this
        },
        off(evento, fn) {
          callbacks.get(evento)?.delete(fn)
          return this
        },
        disparar(evento, ...datos) {
          for (const f of callbacks.get(evento) ?? []) f(...datos)
        },
        connect() {
          this.conexiones++
          this.active = true
          this.connected = true
          this.disparar('connect')
          return this
        },
        disconnect() {
          this.cortes++
          this.active = false
          this.connected = false
          this.disparar('disconnect')
          return this
        },
        timeout() {
          return this
        },
        emit(evento, ...datos) {
          this.emisiones.push(evento)
          if (evento === 'sala:unirse') datos.at(-1)(null, { ok: true })
          return this
        },
        removeAllListeners() {
          callbacks.clear()
        },
      }
    creados.push(s)
    return s
  }
  const url = new URL('../src/lib/tiempo-real.ts', import.meta.url).href
  const modulo = (codigo) => ({
    url: 'data:text/javascript,' + encodeURIComponent(codigo),
    shortCircuit: true,
  })
  const hooks = registerHooks({
    resolve(nombre, contexto, siguiente) {
      if (contexto.parentURL === url && nombre === 'socket.io-client')
        return modulo('export function io(){return globalThis.__covaSocketPrueba()}')
      if (contexto.parentURL === url && nombre === './api')
        return modulo("export function rutaLoginSesionVencida(){return '/login'}")
      return siguiente(nombre, contexto)
    },
  })
  let real
  try {
    real = await import(url)
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const avisos = []
    const quitar = real.escuchar('notificaciones:actualizadas', (datos) => avisos.push(datos))
    const s = creados[0]
    let conexiones = 0,
      reconexiones = 0
    const q1 = real.onConectado(() => conexiones++),
      q2 = real.onReconectado(() => reconexiones++)
    s.connect()
    assert.equal(conexiones, 1)
    assert.equal(reconexiones, 0)
    assert.deepEqual(s.emisiones, [], 'Mantener la campana no se une a ninguna sala')
    s.disparar('notificaciones:actualizadas', { nueva: true })
    assert.deepEqual(avisos, [{ nueva: true }])
    const salir = real.abrirSala(7)
    assert.equal(creados.length, 1, 'Chat y notificaciones comparten el mismo socket')
    salir()
    t.mock.timers.tick(10001)
    assert.equal(s.cortes, 0, 'Salir del chat no corta la conexión de la campana')
    s.connected = false
    globalThis.window.dispatchEvent(new Event('online'))
    assert.equal(conexiones, 2)
    assert.equal(reconexiones, 1)
    assert.equal(creados.length, 1)
    q1()
    q2()
    quitar()
    quitar()
    t.mock.timers.tick(10001)
    assert.equal(s.connected, false)
  } finally {
    real?.cerrarTiempoReal()
    t.mock.timers.reset()
    hooks.deregister()
    delete globalThis.__covaSocketPrueba
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})
