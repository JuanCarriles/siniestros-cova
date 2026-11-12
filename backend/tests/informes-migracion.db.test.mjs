import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import pg from 'pg'

test(
  'La migración conserva casos existentes, importes desconocidos y no inventa una historia anterior',
  { timeout: 90000 },
  async () => {
    assert.notEqual(process.env.NODE_ENV, 'production')
    const url = new URL(process.env.DATABASE_URL)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    const control = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 4000 })
    await control.connect()
    const nombre = `cova_test_informe_migracion_${Date.now()}_${process.pid}`
    let db,
      creada = false
    try {
      await control.query(`CREATE DATABASE "${nombre}"`)
      creada = true
      url.pathname = '/' + nombre
      db = new pg.Client({ connectionString: url.href })
      await db.connect()
      const carpeta = new URL('../prisma/migrations/', import.meta.url),
        nueva = '20261112120000_informe_mensual'
      for (const m of (await readdir(carpeta, { withFileTypes: true }))
        .filter((d) => d.isDirectory() && d.name < nueva)
        .map((d) => d.name)
        .sort())
        await db.query(await readFile(new URL(`${m}/migration.sql`, carpeta), 'utf8'))
      const uno = async (sql) => (await db.query(sql)).rows[0].id
      const dir = await uno('INSERT INTO "Direccion" DEFAULT VALUES RETURNING id')
      const u = await uno(
        `INSERT INTO "Usuario" (nombres,apellidos,documento,telefono,email,contrasena,"tipoUsuario","idDireccion") VALUES ('Usuario','Existente','0','0','existente@example.invalid','-','GESTOR',${dir}) RETURNING id`,
      )
      const a = await uno(`INSERT INTO "Aseguradora" (nombre) VALUES ('Existente') RETURNING id`)
      const e = await uno(
        `INSERT INTO "EstadoSiniestro" (nombre,descripcion) VALUES ('Existente','Abierto') RETURNING id`,
      )
      const id = await uno(
        `INSERT INTO "Siniestro" ("numeroSiniestro","numeroPoliza","fechaAsignacion","menorEdadInvolucrado","idUsuario","idAseguradora","idEstadoSiniestro") VALUES ('NO-TOCAR','POLIZA','2026-01-01T12:00:00Z',false,${u},${a},${e}) RETURNING id`,
      )
      const antes = (await db.query('SELECT * FROM "Siniestro"')).rows[0]
      await db.query(await readFile(new URL(`${nueva}/migration.sql`, carpeta), 'utf8'))
      const despues = (await db.query('SELECT * FROM "Siniestro"')).rows[0]
      for (const campo of Object.keys(antes)) assert.deepEqual(despues[campo], antes[campo], campo)
      assert.equal(despues.montoReclamado, null)
      assert.equal(despues.resultadoCierre, null)
      assert.equal(despues.moneda, 'ARS')
      const registros = (await db.query('SELECT * FROM "RegistroEstadisticoSiniestro" ORDER BY id'))
        .rows
      assert.equal(registros.length, 2)
      assert.equal(registros.filter((r) => r.evento === 'BASELINE').length, 1)
      assert.equal(registros.find((r) => r.idSiniestro === id).datos.numero, 'NO-TOCAR')
      await db.query('BEGIN')
      await db.query(`UPDATE "Siniestro" SET "numeroPoliza"='OTRA' WHERE id=${id}`)
      await db.query('ROLLBACK')
      assert.equal(
        (await db.query('SELECT count(*)::int AS n FROM "RegistroEstadisticoSiniestro"')).rows[0].n,
        2,
      )
    } finally {
      await db?.end()
      if (creada) await control.query(`DROP DATABASE "${nombre}" WITH (FORCE)`)
      await control.end()
    }
  },
)
