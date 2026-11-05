import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioAseguradoras } from '../src/modules/aseguradoras/aseguradoras.service.ts'
import { crearServicioAjustadores } from '../src/modules/ajustadores/ajustadores.service.ts'

test(
  'maestros únicos: dos escrituras simultáneas no duplican y responden 409, también al modificar',
  { timeout: 60000 },
  async () => {
    const original = process.env.DATABASE_URL
    const url = new URL(original)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    const nombre = `cova_test_maestros_${Date.now()}_${process.pid}`
    const db = new pg.Client({ connectionString: original })
    await db.connect()
    let creada = false
    try {
      await db.query(`CREATE DATABASE "${nombre}"`)
      creada = true
      url.pathname = `/${nombre}`
      process.env.DATABASE_URL = url.href
      await promisify(execFile)(
        process.execPath,
        [
          '../node_modules/prisma/build/index.js',
          'migrate',
          'deploy',
          '--config',
          'prisma.config.ts',
        ],
        { env: process.env },
      )
      const prisma = getPrisma()
      // Forzar la carrera después del chequeo previo para comprobar el índice y la traducción de P2002.
      const sinChequeo = (modelo) =>
        new Proxy(modelo, {
          get: (target, key) => (key === 'findFirst' ? async () => null : Reflect.get(target, key)),
        })
      const aseguradoras = crearServicioAseguradoras({
        aseguradora: sinChequeo(prisma.aseguradora),
      })
      const altas = await Promise.allSettled([
        aseguradoras.crear({ nombre: 'Compañía' }),
        aseguradoras.crear({ nombre: 'COMPAÑÍA' }),
      ])
      assert.equal(altas.filter((r) => r.status === 'fulfilled').length, 1)
      assert.equal(altas.find((r) => r.status === 'rejected').reason.status, 409)
      assert.equal(await prisma.aseguradora.count(), 1)
      const a = await prisma.aseguradora.findFirstOrThrow()
      const otra = await aseguradoras.crear({ nombre: 'Otra' })
      await assert.rejects(aseguradoras.modificar(otra.id, { nombre: a.nombre.toLowerCase() }), {
        status: 409,
      })
      const ajustadores = crearServicioAjustadores({
        aseguradora: prisma.aseguradora,
        ajustador: sinChequeo(prisma.ajustador),
      })
      const datos = {
        nombres: 'Ana',
        apellidos: 'Pérez',
        email: 'ana@example.invalid',
        telefono: '1',
        idAseguradora: a.id,
      }
      const emails = await Promise.allSettled([
        ajustadores.crear(datos),
        ajustadores.crear({ ...datos, email: 'ANA@EXAMPLE.INVALID' }),
      ])
      assert.equal(emails.filter((r) => r.status === 'fulfilled').length, 1)
      assert.equal(emails.find((r) => r.status === 'rejected').reason.details.campo, 'email')
      assert.equal(await prisma.ajustador.count(), 1)
      const otro = await ajustadores.crear({ ...datos, email: 'otro@example.invalid' })
      await assert.rejects(ajustadores.modificar(otro.id, { email: 'ANA@example.invalid' }), {
        status: 409,
      })
    } finally {
      await disconnectPrisma()
      process.env.DATABASE_URL = original
      if (creada) await db.query(`DROP DATABASE "${nombre}" WITH (FORCE)`)
      await db.end()
    }
  },
)
