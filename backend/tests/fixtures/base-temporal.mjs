import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'

/**
 * Crea una base PostgreSQL vacía, le aplica las migraciones y corre `trabajo` con DATABASE_URL apuntando a ella.
 * Al terminar (pase o falle) la borra. Para pruebas que necesitan datos confirmados (varias conexiones, sockets),
 * donde no sirve envolver todo en una transacción que se revierte.
 * Solo en un PostgreSQL local, con un usuario que pueda crear bases.
 */
export async function conBaseTemporal(prefijo, trabajo) {
  const original = process.env.DATABASE_URL
  assert.ok(original, 'Hace falta DATABASE_URL local con permiso CREATEDB')
  const conexion = new URL(original)
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(conexion.hostname))
  const nombre = `cova_test_${prefijo}_${Date.now()}_${process.pid}`
  assert.match(nombre, /^cova_test_[a-z_]+_\d+_\d+$/)
  const adminPg = new pg.Client({ connectionString: original })
  await adminPg.connect()
  let creada = false
  try {
    await adminPg.query(`CREATE DATABASE "${nombre}"`)
    creada = true
    conexion.pathname = `/${nombre}`
    process.env.DATABASE_URL = conexion.href
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
    return await trabajo()
  } finally {
    process.env.DATABASE_URL = original
    if (creada) await adminPg.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`)
    await adminPg.end()
  }
}
