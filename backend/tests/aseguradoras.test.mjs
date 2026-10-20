import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import cookieParser from 'cookie-parser'
import { crearRequerirSesion } from '../src/middlewares/autenticar.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'
import { crearAseguradorasRouter } from '../src/modules/aseguradoras/aseguradoras.routes.ts'
import { crearServicioAseguradoras } from '../src/modules/aseguradoras/aseguradoras.service.ts'

// Base falsa en memoria con lo que usa el servicio de aseguradoras
function datosPrueba() {
  const aseguradoras = [
    { id: 1, nombre: 'Andina Seguros', eliminado: false, fechaBaja: null },
    { id: 2, nombre: 'Litoral Seguros', eliminado: true, fechaBaja: new Date('2025-01-01') },
    { id: 3, nombre: 'Mutual Pampeana', eliminado: false, fechaBaja: null },
  ]
  const ajustadores = [
    { idAseguradora: 1, eliminado: false },
    { idAseguradora: 1, eliminado: true },
    { idAseguradora: 2, eliminado: false },
    { idAseguradora: 3, eliminado: true },
  ]
  ajustadores.forEach((a, i) =>
    Object.assign(a, {
      id: i + 1,
      nombres: 'Prueba',
      apellidos: `Ajustador ${i + 1}`,
      email: `ajustador${i + 1}@cova.invalid`,
      telefono: '0',
    }),
  )
  let siguienteId = 4
  let escrituras = 0
  const conConteo = (fila) => ({
    ...fila,
    _count: {
      ajustadores: ajustadores.filter((a) => a.idAseguradora === fila.id && !a.eliminado).length,
    },
  })
  const coincideNombre = (fila, where) =>
    !where.nombre || fila.nombre.toLowerCase() === where.nombre.equals.toLowerCase()
  const prisma = {
    aseguradora: {
      async findMany({ where }) {
        return aseguradoras
          .filter((f) => where.eliminado === undefined || f.eliminado === where.eliminado)
          .map(conConteo)
      },
      async findFirst({ where }) {
        return (
          aseguradoras.find(
            (f) => coincideNombre(f, where) && (!where.id?.not || f.id !== where.id.not),
          ) ?? null
        )
      },
      async findUnique({ where }) {
        const fila = aseguradoras.find((f) => f.id === where.id)
        return fila ? conConteo(fila) : null
      },
      async create({ data }) {
        escrituras++
        const fila = { id: siguienteId++, eliminado: false, fechaBaja: null, ...data }
        aseguradoras.push(fila)
        return conConteo(fila)
      },
      async updateMany({ where, data }) {
        assert.deepEqual(where.ajustadores, { none: { eliminado: false } })
        const fila = aseguradoras.find(
          (f) =>
            f.id === where.id &&
            f.eliminado === where.eliminado &&
            conConteo(f)._count.ajustadores === 0,
        )
        if (!fila) return { count: 0 }
        escrituras++
        Object.assign(fila, data)
        return { count: 1 }
      },
      async update({ where, data }) {
        escrituras++
        const fila = aseguradoras.find((f) => f.id === where.id)
        Object.assign(fila, data)
        return conConteo(fila)
      },
    },
  }
  return {
    prisma,
    aseguradoras,
    ajustadores,
    get escrituras() {
      return escrituras
    },
  }
}

// Sesiones falsas: la cookie dice qué usuario es (la validación real se prueba en auth.test.mjs)
const usuarios = {
  admin: { id: 1, nombres: 'A', apellidos: 'A', email: 'a@x.test', tipoUsuario: 'ADMINISTRADOR' },
  super: {
    id: 2,
    nombres: 'S',
    apellidos: 'S',
    email: 's@x.test',
    tipoUsuario: 'SUPER_ADMINISTRADOR',
  },
  gestor: { id: 3, nombres: 'G', apellidos: 'G', email: 'g@x.test', tipoUsuario: 'GESTOR' },
}
const sesionesFalsas = {
  duracionMs: 1000,
  async validar(token) {
    return usuarios[token] ? { usuario: usuarios[token], renovada: false } : null
  },
}

async function servidor(datos) {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(
    '/api/aseguradoras',
    crearAseguradorasRouter({
      servicio: crearServicioAseguradoras(datos.prisma),
      requerirSesion: crearRequerirSesion(sesionesFalsas),
    }),
  )
  app.use(errorHandler)
  const http = app.listen(0, '127.0.0.1')
  await new Promise((ok) => http.once('listening', ok))
  const base = `http://127.0.0.1:${http.address().port}/api/aseguradoras`
  return {
    pedir: (quien, ruta = '', init = {}) =>
      fetch(`${base}${ruta}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(quien ? { cookie: `cova_sesion=${quien}` } : {}),
        },
      }),
    cerrar: () => new Promise((ok) => http.close(ok)),
  }
}

const json = (body) => ({ body: JSON.stringify(body) })

test('permisos: sin sesión 401, gestor 403 (ni lee ni escribe); admin y superadmin acceden', async (t) => {
  const datos = datosPrueba()
  const api = await servidor(datos)
  t.after(api.cerrar)
  for (const [quien, esperado] of [
    [null, 401],
    ['inventada', 401],
    ['gestor', 403],
    ['admin', 200],
    ['super', 200],
  ]) {
    assert.equal((await api.pedir(quien)).status, esperado, `GET ${quien}`)
    if (esperado !== 200) {
      const alta = await api.pedir(quien, '', { method: 'POST', ...json({ nombre: 'Nueva' }) })
      assert.equal(alta.status, esperado, `POST ${quien}`)
      assert.equal((await api.pedir(quien, '/1/baja', { method: 'PATCH' })).status, esperado)
    }
  }
  assert.equal(datos.escrituras, 0)
})

test('listado: activas por defecto, todas con incluirBajas; cuenta solo ajustadores activos', async (t) => {
  const api = await servidor(datosPrueba())
  t.after(api.cerrar)
  const activas = await (await api.pedir('admin')).json()
  assert.deepEqual(
    activas.map((f) => [f.nombre, f.cantidadAjustadores]),
    [
      ['Andina Seguros', 1],
      ['Mutual Pampeana', 0],
    ],
  )
  assert.equal((await (await api.pedir('admin', '?incluirBajas=true')).json()).length, 3)
  assert.equal((await api.pedir('admin', '?incluirBajas=quizas')).status, 400)
})

test('alta y modificación: valida el nombre (3 a 60, sin repetir) y recorta espacios', async (t) => {
  const datos = datosPrueba()
  const api = await servidor(datos)
  t.after(api.cerrar)
  const alta = (body) => api.pedir('admin', '', { method: 'POST', ...json(body) })

  for (const body of [
    { nombre: '   ' },
    { nombre: 'AB' },
    { nombre: 'x'.repeat(61) },
    { nombre: 'Válida', eliminado: true },
  ])
    assert.equal((await alta(body)).status, 400, JSON.stringify(body))

  let respuesta = await alta({ nombre: 'ANDINA seguros' })
  assert.equal(respuesta.status, 409)
  assert.match((await respuesta.json()).error, /Ya existe una aseguradora con ese nombre/)
  respuesta = await alta({ nombre: 'litoral seguros' })
  assert.equal(respuesta.status, 409)
  assert.match((await respuesta.json()).error, /dada de baja.*reactivarla/)

  respuesta = await alta({ nombre: '  Río Plata Seguros  ' })
  assert.equal(respuesta.status, 201)
  const creada = await respuesta.json()
  assert.deepEqual(creada, {
    id: 4,
    nombre: 'Río Plata Seguros',
    eliminado: false,
    fechaBaja: null,
    cantidadAjustadores: 0,
  })

  const modificar = (id, body) => api.pedir('admin', `/${id}`, { method: 'PATCH', ...json(body) })
  assert.equal((await modificar(4, { nombre: 'Río Plata' })).status, 200)
  assert.equal(datos.aseguradoras[3].nombre, 'Río Plata')
  assert.equal((await modificar(4, { nombre: 'río plata' })).status, 200, 'su propio nombre')
  assert.equal((await modificar(4, { nombre: 'Andina Seguros' })).status, 409)
  assert.equal((await modificar(4, {})).status, 400)
  assert.equal((await modificar(2, { nombre: 'Otra' })).status, 409, 'dada de baja')
  assert.equal((await modificar(99, { nombre: 'Otra' })).status, 404)
  assert.equal((await modificar('abc', { nombre: 'Otra' })).status, 400)
})

test('baja: solo sin ajustadores activos; conserva todo y se puede reactivar', async (t) => {
  const datos = datosPrueba()
  const api = await servidor(datos)
  t.after(api.cerrar)
  const accion = (id, que) => api.pedir('admin', `/${id}/${que}`, { method: 'PATCH' })

  // Andina tiene 1 ajustador activo (el dado de baja no cuenta)
  let respuesta = await accion(1, 'baja')
  assert.equal(respuesta.status, 409)
  assert.match(
    (await respuesta.json()).error,
    /tiene 1 ajustador activo\. Primero dalo de baja o pasalo/,
  )
  assert.equal(datos.aseguradoras[0].eliminado, false)

  // Mutual Pampeana solo tiene un ajustador dado de baja
  assert.equal((await accion(3, 'baja')).status, 204)
  assert.equal(datos.aseguradoras[2].eliminado, true)
  assert.ok(datos.aseguradoras[2].fechaBaja instanceof Date)
  assert.equal((await accion(3, 'baja')).status, 409)
  assert.equal(datos.ajustadores.length, 4, 'la baja no borra ajustadores')

  assert.equal((await accion(3, 'reactivacion')).status, 204)
  assert.equal(datos.aseguradoras[2].eliminado, false)
  assert.equal(datos.aseguradoras[2].fechaBaja, null)
  assert.equal((await accion(3, 'reactivacion')).status, 409)
  assert.equal((await accion(99, 'reactivacion')).status, 404)
})

test('bloqueo: respuesta estructurada con la cantidad actual de ajustadores activos', async (t) => {
  const datos = datosPrueba()
  const api = await servidor(datos)
  t.after(api.cerrar)
  // Simula que se agrega otro ajustador después de haber cargado el listado en el cliente.
  datos.ajustadores.push({
    id: 5,
    idAseguradora: 1,
    eliminado: false,
    nombres: 'Nuevo',
    apellidos: 'Ajustador',
    email: 'nuevo@cova.invalid',
    telefono: '0',
  })
  const res = await api.pedir('admin', '/1/baja', { method: 'PATCH' })
  assert.equal(res.status, 409)
  const { details } = await res.json()
  assert.deepEqual(details, {
    codigo: 'ASEGURADORA_CON_AJUSTADORES',
    idAseguradora: 1,
    nombreAseguradora: 'Andina Seguros',
    cantidadAjustadores: 2,
  })
  assert.equal(datos.escrituras, 0)
})

test('baja con id inexistente no produce escrituras', async (t) => {
  const datos = datosPrueba()
  const api = await servidor(datos)
  t.after(api.cerrar)
  assert.equal((await api.pedir('admin', '/99/baja', { method: 'PATCH' })).status, 404)
  assert.equal(datos.escrituras, 0)
})
