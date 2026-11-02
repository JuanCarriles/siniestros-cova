import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
// pg viene con @prisma/adapter-pg. Hace falta para correr los .sql tal cual (varias sentencias y bloques DO), que
// Prisma no ejecuta de una sola vez.
import pg from 'pg'

// Migraciones que transforman datos (E4-10): se prueban en una base temporal, creada desde cero con las
// migraciones anteriores y borrada al final. No toca la base de desarrollo.
const CARPETA = new URL('../prisma/migrations/', import.meta.url)
const VEHICULO_SINIESTRO = '20261027130000_vehiculo_siniestro'
const NUMERO_UNICO = '20261028120000_numero_siniestro_unico'
const PARTES_CONCURRENCIA = '20261104120000_partes_concurrencia'
const ABOGADOS_PERITOS_CONCURRENCIA = '20261104130000_abogados_peritos_concurrencia'

if (process.env.NODE_ENV === 'production') throw new Error('No correr en producción')
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL')

const migraciones = (await readdir(CARPETA, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()
const sql = (nombre) => readFile(new URL(`${nombre}/migration.sql`, CARPETA), 'utf8')

// Una base nueva con todas las migraciones anteriores a `hasta`
async function baseHasta(hasta) {
  const nombre = `cova_prueba_migraciones_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  const admin = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await admin.connect()
  await admin.query(`CREATE DATABASE "${nombre}"`)
  await admin.end()
  const url = new URL(process.env.DATABASE_URL)
  url.pathname = `/${nombre}`
  url.searchParams.delete('schema')
  const db = new pg.Client({ connectionString: url.toString() })
  await db.connect()
  for (const m of migraciones.filter((m) => m < hasta)) await db.query(await sql(m))
  return {
    db,
    async borrar() {
      await db.end()
      const admin = new pg.Client({ connectionString: process.env.DATABASE_URL })
      await admin.connect()
      await admin.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`)
      await admin.end()
    },
  }
}

// Lo mínimo para tener siniestros: estado, aseguradora y usuario
async function datosBase(db) {
  const uno = async (consulta, valores) => (await db.query(consulta, valores)).rows[0].id
  const estado = await uno(
    `INSERT INTO "EstadoSiniestro" (nombre, descripcion) VALUES ('Abierto', '-') RETURNING id`,
  )
  const aseguradora = await uno(`INSERT INTO "Aseguradora" (nombre) VALUES ('Prueba') RETURNING id`)
  const direccion = await uno(`INSERT INTO "Direccion" DEFAULT VALUES RETURNING id`)
  const usuario = await uno(
    `INSERT INTO "Usuario" (nombres, apellidos, documento, telefono, email, contrasena, "tipoUsuario", "idDireccion")
     VALUES ('A', 'B', '0', '0', 'a@b.test', '-', 'ADMINISTRADOR', $1) RETURNING id`,
    [direccion],
  )
  const siniestro = (numero) =>
    uno(
      `INSERT INTO "Siniestro" ("numeroSiniestro", "numeroPoliza", "fechaAsignacion", demorado,
         "menorEdadInvolucrado", "idEstadoSiniestro", "idAseguradora", "idUsuario")
       VALUES ($1, 'P', now(), false, false, $2, $3, $4) RETURNING id`,
      [numero, estado, aseguradora, usuario],
    )
  return { uno, siniestro }
}

test('migración vehiculo_siniestro: un vehículo compartido se copia para cada siniestro', async () => {
  const { db, borrar } = await baseHasta(VEHICULO_SINIESTRO)
  try {
    const { uno, siniestro } = await datosBase(db)
    const s1 = await siniestro('S-1')
    const s2 = await siniestro('S-2')
    const vehiculo = await uno(
      `INSERT INTO "Vehiculo" (dominio, marca, "rolAccidente") VALUES ('AE123CD', 'Ford', 'TERCERO') RETURNING id`,
    )
    const persona = (idSiniestro, nombre) =>
      uno(
        `INSERT INTO "PersonaInvolucrada" ("idSiniestro", "idVehiculo", "nombreCompletoRazonSocial")
         VALUES ($1, $2, $3) RETURNING id`,
        [idSiniestro, vehiculo, nombre],
      )
    const ana = await persona(s1, 'Ana')
    const beto = await persona(s2, 'Beto')
    const carla = await persona(s2, 'Carla')

    await db.query(await sql(VEHICULO_SINIESTRO))

    const vehiculos = (
      await db.query(`SELECT id, dominio, marca, "idSiniestro" FROM "Vehiculo" ORDER BY id`)
    ).rows
    assert.equal(vehiculos.length, 2, 'el original y una copia')
    assert.deepEqual(
      vehiculos.map((v) => [v.dominio, v.marca, v.idSiniestro]),
      [
        ['AE123CD', 'Ford', s1],
        ['AE123CD', 'Ford', s2],
      ],
    )
    const de = async (id) =>
      (await db.query(`SELECT "idVehiculo" FROM "PersonaInvolucrada" WHERE id = $1`, [id])).rows[0]
        .idVehiculo
    assert.equal(await de(ana), vehiculos[0].id)
    assert.equal(
      await de(beto),
      vehiculos[1].id,
      'las personas del segundo siniestro van a su copia',
    )
    assert.equal(await de(carla), vehiculos[1].id)
  } finally {
    await borrar()
  }
})

test('migración vehiculo_siniestro: con vehículos sin personas se detiene sin cambiar nada', async () => {
  const { db, borrar } = await baseHasta(VEHICULO_SINIESTRO)
  try {
    const { uno } = await datosBase(db)
    const suelto = await uno(`INSERT INTO "Vehiculo" (dominio) VALUES ('ZZ999ZZ') RETURNING id`)

    await assert.rejects(db.query(await sql(VEHICULO_SINIESTRO)), (error) => {
      assert.match(error.message, /vehículos sin personas/)
      assert.match(error.message, new RegExp(`id ${suelto} \\(dominio ZZ999ZZ\\)`))
      return true
    })
    // No se borró el vehículo ni se agregó la columna
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM "Vehiculo"`)).rows[0].n, 1)
    const columna = await db.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'Vehiculo' AND column_name = 'idSiniestro'`,
    )
    assert.equal(columna.rowCount, 0)
  } finally {
    await borrar()
  }
})

test('migración numero_siniestro_unico: con repetidos se detiene y los lista; sin repetidos, frena los nuevos', async () => {
  const { db, borrar } = await baseHasta(NUMERO_UNICO)
  try {
    const { siniestro } = await datosBase(db)
    const a = await siniestro('S-1')
    const b = await siniestro('s-1')

    await assert.rejects(db.query(await sql(NUMERO_UNICO)), (error) => {
      assert.match(error.message, /números de siniestro repetidos/)
      assert.match(error.message, new RegExp(`siniestros ${a}, ${b}`))
      return true
    })

    await db.query(`UPDATE "Siniestro" SET "numeroSiniestro" = 'S-2' WHERE id = $1`, [b])
    await db.query(await sql(NUMERO_UNICO))
    await assert.rejects(siniestro('s-2'), { code: '23505' }, 'sin distinguir mayúsculas')
  } finally {
    await borrar()
  }
})

test('migración partes_concurrencia: con titulares o dominios repetidos se detiene; sin repetidos, los frena', async () => {
  const { db, borrar } = await baseHasta(PARTES_CONCURRENCIA)
  try {
    const { uno, siniestro } = await datosBase(db)
    const caso = await siniestro('S-1')
    const vehiculo = (dominio, eliminado = false) =>
      uno(
        `INSERT INTO "Vehiculo" (dominio, "idSiniestro", eliminado, "fechaBaja")
         VALUES ($1, $2, $3, CASE WHEN $3 THEN now() END) RETURNING id`,
        [dominio, caso, eliminado],
      )
    const titular = (idVehiculo, eliminado = false) =>
      uno(
        `INSERT INTO "PersonaInvolucrada" ("idSiniestro", "idVehiculo", "esPropietario", eliminado, "fechaBaja")
         VALUES ($1, $2, true, $3, CASE WHEN $3 THEN now() END) RETURNING id`,
        [caso, idVehiculo, eliminado],
      )
    const a = await vehiculo('AE 123 CD')
    const b = await vehiculo('ae-123cd')
    // Los dados de baja no cuentan
    await vehiculo('AE123CD', true)
    const t1 = await titular(a)
    const t2 = await titular(a)
    await titular(a, true)

    await assert.rejects(db.query(await sql(PARTES_CONCURRENCIA)), (error) => {
      assert.ok(error.message.includes(`vehículo ${a} (personas ${t1}, ${t2})`), error.message)
      return true
    })
    await db.query(
      `UPDATE "PersonaInvolucrada" SET eliminado = true, "fechaBaja" = now() WHERE id = $1`,
      [t2],
    )
    await assert.rejects(db.query(await sql(PARTES_CONCURRENCIA)), (error) => {
      assert.ok(error.message.includes(`siniestro ${caso} (vehículos ${a}, ${b})`), error.message)
      return true
    })

    await db.query(`UPDATE "Vehiculo" SET eliminado = true, "fechaBaja" = now() WHERE id = $1`, [b])
    await db.query(await sql(PARTES_CONCURRENCIA))
    await assert.rejects(
      vehiculo('AE-123 cd'),
      { code: '23505' },
      'el mismo dominio escrito distinto',
    )
    await assert.rejects(titular(a), { code: '23505' }, 'un segundo titular activo')
    await vehiculo('AE 123 CD', true)
    const { rows } = await db.query(`SELECT revision FROM "Vehiculo" WHERE id = $1`, [a])
    assert.equal(rows[0].revision, 0)
  } finally {
    await borrar()
  }
})

test('migración abogados_peritos_concurrencia: con dos peritos activos del mismo tipo se detiene; después, los frena', async () => {
  const { db, borrar } = await baseHasta(ABOGADOS_PERITOS_CONCURRENCIA)
  try {
    const { uno, siniestro } = await datosBase(db)
    const caso = await siniestro('S-1')
    const perito = (tipo, eliminado = false) =>
      uno(
        `INSERT INTO "Perito" (nombre, "fechaSolicitud", cerrado, "idSiniestro", "tipoPerito", eliminado, "fechaBaja")
         VALUES ('P', now(), false, $1, $2, $3, CASE WHEN $3 THEN now() END) RETURNING id`,
        [caso, tipo, eliminado],
      )
    const a = await perito('CESVI')
    const b = await perito('CESVI')
    await perito('MEDICO')
    // Los dados de baja no cuentan
    await perito('MEDICO', true)

    await assert.rejects(db.query(await sql(ABOGADOS_PERITOS_CONCURRENCIA)), (error) => {
      assert.ok(
        error.message.includes(`CESVI en el siniestro ${caso} (peritos ${a}, ${b})`),
        error.message,
      )
      return true
    })
    await db.query(`UPDATE "Perito" SET eliminado = true, "fechaBaja" = now() WHERE id = $1`, [b])
    await db.query(await sql(ABOGADOS_PERITOS_CONCURRENCIA))
    await assert.rejects(perito('MEDICO'), { code: '23505' }, 'un segundo perito médico activo')
    await perito('CESVI', true)
    const { rows } = await db.query(`SELECT revision FROM "Perito" WHERE id = $1`, [a])
    assert.equal(rows[0].revision, 0)
  } finally {
    await borrar()
  }
})
