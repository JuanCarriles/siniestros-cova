import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import {
  autorizarVistaPrevia,
  crearAseguradorasRouter,
} from '../src/modules/aseguradoras/aseguradoras.routes.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'

function datosPrueba() {
  const aseguradoras = [
    { id: 1, nombre: 'Andina', eliminado: false, fechaBaja: null },
    { id: 2, nombre: 'Litoral', eliminado: true, fechaBaja: new Date('2025-01-01') },
  ]
  const ajustadores = [
    { idAseguradora: 1, eliminado: false },
    { idAseguradora: 1, eliminado: true },
    { idAseguradora: 2, eliminado: false },
  ]
  const relacionados = { vehiculos: [1, 2], siniestros: [3, 4] }
  let siguienteId = 3
  let escritura = 0
  function conConteo(fila) {
    return {
      ...fila,
      _count: {
        ajustadores: ajustadores.filter((a) => a.idAseguradora === fila.id && !a.eliminado).length,
      },
    }
  }
  const prisma = {
    usuario: {
      findFirst: async ({ where }) => {
        if (where.id === 1) return { tipoUsuario: 'ADMINISTRADOR' }
        if (where.id === 2) return { tipoUsuario: 'SUPER_ADMINISTRADOR' }
        if (where.id === 3) return { tipoUsuario: 'GESTOR' }
        return null
      },
    },
    aseguradora: {
      findMany: async ({ where }) =>
        aseguradoras
          .filter((fila) => where.eliminado === undefined || fila.eliminado === where.eliminado)
          .map(conConteo),
      create: async ({ data }) => {
        escritura++
        const fila = { id: siguienteId++, ...data, eliminado: false, fechaBaja: null }
        aseguradoras.push(fila)
        return conConteo(fila)
      },
      updateMany: async ({ where, data }) => {
        const fila = aseguradoras.find(
          (valor) => valor.id === where.id && valor.eliminado === where.eliminado,
        )
        if (!fila) return { count: 0 }
        escritura++
        Object.assign(fila, data)
        return { count: 1 }
      },
      findUniqueOrThrow: async ({ where }) =>
        conConteo(aseguradoras.find((fila) => fila.id === where.id)),
    },
  }
  return {
    prisma,
    aseguradoras,
    ajustadores,
    relacionados,
    get escritura() {
      return escritura
    },
  }
}

async function servidor(datos, usuarioId, vistaPrevia = false) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    if (usuarioId) res.locals.usuarioId = usuarioId
    next()
  })
  const ruta = vistaPrevia ? '/api/vista-previa/aseguradoras' : '/api/aseguradoras'
  if (vistaPrevia)
    app.use(
      ruta,
      autorizarVistaPrevia,
      crearAseguradorasRouter(() => datos.prisma),
    )
  else
    app.use(
      ruta,
      crearAseguradorasRouter(() => datos.prisma),
    )
  app.use(errorHandler)
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
  })
  const base = `http://127.0.0.1:${server.address().port}${ruta}`
  return {
    pedir: (path = '', init) =>
      fetch(`${base}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      }),
    cerrar: () => new Promise((resolve) => server.close(resolve)),
  }
}

test('vista previa local: permite el ABM sin depender de un usuario ni de un rol del cliente', async () => {
  const datos = datosPrueba()
  datos.prisma.usuario.findFirst = async () => {
    throw new Error('La vista previa no debe consultar usuarios')
  }
  const api = await servidor(datos, null, true)
  try {
    assert.equal((await api.pedir('', { headers: { 'x-role': 'GESTOR' } })).status, 200)
    const respuesta = await api.pedir('', {
      method: 'POST',
      headers: { 'x-role': 'GESTOR' },
      body: JSON.stringify({ nombre: 'Creada desde la vista' }),
    })
    assert.equal(respuesta.status, 201)
    assert.equal(datos.aseguradoras[2].nombre, 'Creada desde la vista')
  } finally {
    await api.cerrar()
  }
})

test('permisos: sin sesión y gestor no leen ni escriben; admin y superadmin acceden', async () => {
  const datos = datosPrueba()
  for (const [usuarioId, esperado] of [
    [null, 401],
    [3, 403],
    [1, 200],
    [2, 200],
  ]) {
    const api = await servidor(datos, usuarioId)
    try {
      assert.equal((await api.pedir()).status, esperado)
      if (esperado !== 200) {
        assert.equal(
          (await api.pedir('', { method: 'POST', body: JSON.stringify({ nombre: 'X' }) })).status,
          esperado,
        )
      }
    } finally {
      await api.cerrar()
    }
  }
  assert.equal(datos.escritura, 0)
})

test('listado, conteo activo, validación, baja lógica y reactivación', async () => {
  const datos = datosPrueba()
  const api = await servidor(datos, 1)
  try {
    let respuesta = await api.pedir()
    let filas = await respuesta.json()
    assert.equal(respuesta.status, 200)
    assert.deepEqual(
      filas.map((fila) => fila.nombre),
      ['Andina'],
    )
    assert.equal(filas[0].cantidadAjustadores, 1)

    respuesta = await api.pedir('?incluirBajas=true')
    filas = await respuesta.json()
    assert.equal(filas.length, 2)
    assert.equal(filas[1].cantidadAjustadores, 1)
    assert.equal((await api.pedir('?incluirBajas=quizas')).status, 400)

    assert.equal(
      (await api.pedir('', { method: 'POST', body: JSON.stringify({ nombre: '  ' }) })).status,
      400,
    )
    assert.equal(
      (
        await api.pedir('', {
          method: 'POST',
          body: JSON.stringify({ nombre: 'A', eliminado: true }),
        })
      ).status,
      400,
    )
    respuesta = await api.pedir('', {
      method: 'POST',
      body: JSON.stringify({ nombre: '  Nueva  ' }),
    })
    assert.equal(respuesta.status, 201)
    assert.equal((await respuesta.json()).nombre, 'Nueva')
    assert.equal(
      (await api.pedir('/3', { method: 'PATCH', body: JSON.stringify({ nombre: 'Renombrada' }) }))
        .status,
      200,
    )
    assert.equal(datos.aseguradoras[2].nombre, 'Renombrada')

    assert.equal((await api.pedir('/1/baja', { method: 'PATCH' })).status, 204)
    assert.equal(datos.aseguradoras[0].eliminado, true)
    assert.ok(datos.aseguradoras[0].fechaBaja instanceof Date)
    assert.equal((await api.pedir('/1/baja', { method: 'PATCH' })).status, 404)
    assert.equal(
      (await api.pedir('/1', { method: 'PATCH', body: JSON.stringify({ nombre: 'No' }) })).status,
      404,
    )
    assert.equal((await api.pedir()).status, 200)
    assert.deepEqual(
      (await (await api.pedir()).json()).map((fila) => fila.nombre),
      ['Renombrada'],
    )

    assert.equal((await api.pedir('/1/reactivacion', { method: 'PATCH' })).status, 204)
    assert.equal(datos.aseguradoras[0].eliminado, false)
    assert.equal(datos.aseguradoras[0].fechaBaja, null)
    assert.equal((await api.pedir('/1/reactivacion', { method: 'PATCH' })).status, 404)
    assert.equal(datos.ajustadores.length, 3)
    assert.deepEqual(datos.relacionados, { vehiculos: [1, 2], siniestros: [3, 4] })
  } finally {
    await api.cerrar()
  }
})
