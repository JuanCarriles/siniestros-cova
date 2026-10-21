import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import { crearRequerirSesion } from '../src/middlewares/autenticar.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { crearSiniestrosRouter } from '../src/modules/siniestros/siniestros.routes.ts'

// La consulta se prueba contra PostgreSQL en siniestros.db.test.mjs. Acá, permisos y validación de los filtros
// con un servicio falso que registra lo que recibe.
const usuarios = {
  admin: { id: 1, nombres: 'A', apellidos: 'A', email: 'a@x.test', tipoUsuario: 'ADMINISTRADOR' },
  gestor: { id: 3, nombres: 'G', apellidos: 'G', email: 'g@x.test', tipoUsuario: 'GESTOR' },
}
const sesionesFalsas = {
  duracionMs: 1000,
  async validar(token) {
    return usuarios[token] ? { usuario: usuarios[token], renovada: false } : null
  },
}

async function servidor() {
  const llamadas = []
  const registrar =
    (nombre) =>
    async (...args) => {
      llamadas.push([nombre, ...args])
      return {}
    }
  const servicio = {
    listar: registrar('listar'),
    opciones: registrar('opciones'),
    obtener: registrar('obtener'),
    partes: registrar('partes'),
  }
  const app = express()
  app.use(cookieParser())
  app.use(
    '/api/siniestros',
    crearSiniestrosRouter({ servicio, requerirSesion: crearRequerirSesion(sesionesFalsas) }),
  )
  app.use(errorHandler)
  const http = app.listen(0, '127.0.0.1')
  await new Promise((ok) => http.once('listening', ok))
  const base = `http://127.0.0.1:${http.address().port}/api/siniestros`
  return {
    llamadas,
    pedir: (quien, ruta = '') =>
      fetch(`${base}${ruta}`, { headers: quien ? { cookie: `cova_sesion=${quien}` } : {} }),
    cerrar: () => new Promise((ok) => http.close(ok)),
  }
}

test('permisos: sin sesión 401; gestor y administrador acceden con su usuario', async (t) => {
  const api = await servidor()
  t.after(api.cerrar)
  assert.equal((await api.pedir(null)).status, 401)
  assert.equal((await api.pedir('inventada', '/opciones')).status, 401)
  assert.equal(api.llamadas.length, 0)
  assert.equal((await api.pedir('gestor')).status, 200)
  assert.equal((await api.pedir('admin', '/7/partes')).status, 200)
  assert.equal(api.llamadas[0][1].id, 3, 'el servicio recibe el usuario de la sesión')
  assert.deepEqual(api.llamadas[1].slice(2), [7])
  // La ficha: el servicio decide el acceso con el usuario de la sesión (E4-03)
  assert.equal((await api.pedir('gestor', '/9')).status, 200)
  assert.deepEqual(
    [api.llamadas[2][0], api.llamadas[2][1].id, api.llamadas[2][2]],
    ['obtener', 3, 9],
  )
})

test('filtros: valores por defecto y validación de la dirección', async (t) => {
  const api = await servidor()
  t.after(api.cerrar)
  assert.equal((await api.pedir('admin')).status, 200)
  assert.deepEqual(api.llamadas.pop()[2], {
    pagina: 1,
    porPagina: 25,
    bajas: false,
    orden: 'asignacion',
  })
  const res = await api.pedir(
    'admin',
    '?pagina=3&porPagina=50&q=%20R%C3%ADos%20&estado=2&aseguradora=4&gestor=5&bajas=true&orden=demora',
  )
  assert.equal(res.status, 200)
  assert.deepEqual(api.llamadas.pop()[2], {
    pagina: 3,
    porPagina: 50,
    q: 'Ríos',
    estado: 2,
    aseguradora: 4,
    gestor: 5,
    bajas: true,
    orden: 'demora',
  })
  // Vacíos: como si no estuvieran
  assert.equal((await api.pedir('admin', '?q=&estado=&pagina=')).status, 200)
  assert.deepEqual(api.llamadas.pop()[2].pagina, 1)
  for (const malo of [
    '?porPagina=30',
    '?pagina=0',
    '?estado=abc',
    '?orden=nombre',
    '?bajas=si',
    `?q=${'x'.repeat(101)}`,
    '?estado=1&estado=2',
    '?inventado=1',
  ]) {
    assert.equal((await api.pedir('admin', malo)).status, 400, malo)
  }
  assert.equal((await api.pedir('admin', '/abc/partes')).status, 400)
  assert.equal((await api.pedir('admin', '/abc')).status, 400)
  assert.equal((await api.pedir(null, '/7')).status, 401)
  assert.equal(api.llamadas.length, 0)
})
