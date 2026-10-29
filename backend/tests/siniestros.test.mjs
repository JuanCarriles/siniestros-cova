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
  const alta = {
    opciones: registrar('altaOpciones'),
    validarDatosCaso: registrar('validarDatosCaso'),
  }
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(
    '/api/siniestros',
    crearSiniestrosRouter({
      servicio,
      alta,
      requerirSesion: crearRequerirSesion(sesionesFalsas),
    }),
  )
  app.use(errorHandler)
  const http = app.listen(0, '127.0.0.1')
  await new Promise((ok) => http.once('listening', ok))
  const base = `http://127.0.0.1:${http.address().port}/api/siniestros`
  return {
    llamadas,
    pedir: (quien, ruta = '', body) =>
      fetch(`${base}${ruta}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          ...(quien ? { cookie: `cova_sesion=${quien}` } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
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
    activos: false,
    bajas: false,
    orden: 'asignacion',
  })
  const res = await api.pedir(
    'admin',
    '?pagina=3&porPagina=50&q=%20R%C3%ADos%20&estado=2&aseguradora=4&gestor=5&activos=true&bajas=true&orden=demora',
  )
  assert.equal(res.status, 200)
  assert.deepEqual(api.llamadas.pop()[2], {
    pagina: 3,
    porPagina: 50,
    q: 'Ríos',
    estado: 2,
    aseguradora: 4,
    gestor: 5,
    activos: true,
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
    '?activos=si',
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

// E4-04: alta, paso 1. El formato lo valida el schema compartido antes de llegar al servicio.
const datosCaso = {
  numeroSiniestro: ' 2026-04871 ',
  numeroPoliza: '44-9820117',
  inicioVigencia: '',
  idAseguradora: '2',
  sucursal: 'Casa central',
  idAjustador: '',
  fechaOcurrencia: '2026-10-01',
  horaOcurrencia: '14:30',
  menorEdadInvolucrado: false,
  causa: '',
  lugar: { idProvincia: '', localidad: '', calle: '', codigoPostal: '' },
}

test('alta: solo administración; el gestor no ve las opciones ni valida', async (t) => {
  const api = await servidor()
  t.after(api.cerrar)
  assert.equal((await api.pedir(null, '/alta/opciones')).status, 401)
  assert.equal((await api.pedir('gestor', '/alta/opciones')).status, 403)
  assert.equal((await api.pedir('gestor', '/alta/datos-caso', datosCaso)).status, 403)
  assert.equal(api.llamadas.length, 0)
  assert.equal((await api.pedir('admin', '/alta/opciones')).status, 200)
  assert.equal(api.llamadas.pop()[0], 'altaOpciones')
})

test('alta paso 1: normaliza lo cargado y rechaza lo que falta antes del servicio', async (t) => {
  const api = await servidor()
  t.after(api.cerrar)
  assert.equal((await api.pedir('admin', '/alta/datos-caso', datosCaso)).status, 204)
  assert.deepEqual(api.llamadas.pop(), [
    'validarDatosCaso',
    {
      numeroSiniestro: '2026-04871',
      numeroPoliza: '44-9820117',
      inicioVigencia: null,
      idAseguradora: 2,
      sucursal: 'Casa central',
      idAjustador: null,
      fechaOcurrencia: '2026-10-01',
      horaOcurrencia: '14:30',
      menorEdadInvolucrado: false,
      causa: null,
      lugar: { idProvincia: null, localidad: null, calle: null, codigoPostal: null },
    },
  ])
  const faltan = await api.pedir('admin', '/alta/datos-caso', {
    ...datosCaso,
    numeroSiniestro: '  ',
    numeroPoliza: '',
    idAseguradora: '',
    sucursal: '',
  })
  assert.equal(faltan.status, 400)
  assert.deepEqual(Object.keys((await faltan.json()).details).sort(), [
    'idAseguradora',
    'numeroPoliza',
    'numeroSiniestro',
    'sucursal',
  ])
  for (const malo of [
    { fechaOcurrencia: '2999-01-01' },
    { fechaOcurrencia: '', horaOcurrencia: '10:00' },
    { menorEdadInvolucrado: 'no' },
    { idAseguradora: 'abc' },
    { inventado: 1 },
  ]) {
    const res = await api.pedir('admin', '/alta/datos-caso', { ...datosCaso, ...malo })
    assert.equal(res.status, 400, JSON.stringify(malo))
  }
  assert.equal(api.llamadas.length, 0)
})
