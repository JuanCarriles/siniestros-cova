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
const NOVEDADES_AUTOR = '20261105120000_novedades_autor'
const NOVEDADES_AUTOR_HISTORICO = '20261105121000_novedades_autor_historico'

if (process.env.NODE_ENV === 'production') throw new Error('No correr en producción')
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL')

const migraciones = (await readdir(CARPETA, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()
const sql = (nombre) => readFile(new URL(`${nombre}/migration.sql`, CARPETA), 'utf8')

// Una base nueva con todas las migraciones anteriores a `hasta`
async function baseHasta(hasta, omitir = []) {
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
  for (const m of migraciones.filter((m) => m < hasta && !omitir.includes(m)))
    await db.query(await sql(m))
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

test('migración novedades_autor: las novedades anteriores quedan a nombre del usuario asignado a su siniestro', async () => {
  const { db, borrar } = await baseHasta(NOVEDADES_AUTOR)
  try {
    const { uno, siniestro } = await datosBase(db)
    const caso = await siniestro('S-1')
    const otro = await siniestro('S-2')
    const direccion = await uno(`INSERT INTO "Direccion" DEFAULT VALUES RETURNING id`)
    const gestora = await uno(
      `INSERT INTO "Usuario" (nombres, apellidos, documento, telefono, email, contrasena, "tipoUsuario", "idDireccion")
       VALUES ('Ana', 'Ruiz', '0', '0', 'ana@b.test', '-', 'GESTOR', $1) RETURNING id`,
      [direccion],
    )
    await db.query(`UPDATE "Siniestro" SET "idUsuario" = $1 WHERE id = $2`, [gestora, otro])
    const novedad = (idSiniestro) =>
      uno(
        `INSERT INTO "NovedadSiniestro" (descripcion, autor, "idSiniestro") VALUES ('N', 'Ana Ruiz', $1) RETURNING id`,
        [idSiniestro],
      )
    const deCaso = await novedad(caso)
    const deOtro = await novedad(otro)

    await db.query(await sql(NOVEDADES_AUTOR))
    const { rows } = await db.query(
      `SELECT id, "idUsuario", autor FROM "NovedadSiniestro" ORDER BY id`,
    )
    const { rows: admins } = await db.query(`SELECT "idUsuario" FROM "Siniestro" WHERE id = $1`, [
      caso,
    ])
    assert.deepEqual(rows, [
      { id: deCaso, idUsuario: admins[0].idUsuario, autor: 'Ana Ruiz' },
      { id: deOtro, idUsuario: gestora, autor: 'Ana Ruiz' },
    ])
    // De acá en adelante, toda novedad dice quién la cargó
    await assert.rejects(novedad(caso), { code: '23502' })
  } finally {
    await borrar()
  }
})

test('migración novedades_autor_historico: cada novedad anterior queda a nombre de quien la escribió, o sin usuario', async () => {
  const { db, borrar } = await baseHasta(NOVEDADES_AUTOR_HISTORICO)
  try {
    const { uno, siniestro } = await datosBase(db)
    const direccion = await uno(`INSERT INTO "Direccion" DEFAULT VALUES RETURNING id`)
    const usuario = (nombres, apellidos, email) =>
      uno(
        `INSERT INTO "Usuario" (nombres, apellidos, documento, telefono, email, contrasena, "tipoUsuario", "idDireccion")
         VALUES ($1, $2, '0', '0', $3, '-', 'GESTOR', $4) RETURNING id`,
        [nombres, apellidos, email, direccion],
      )
    const ana = await usuario('AnaLegado', 'Prueba', 'ana@b.test')
    const bruno = await usuario('BrunoLegado', 'Prueba', 'bruno@b.test')
    await usuario('Juan', 'Repetido', 'juan1@b.test')
    await usuario('Juan', 'Repetido', 'juan2@b.test')
    // El caso se reasignó a Bruno: la migración anterior le atribuyó todas sus novedades
    const caso = await siniestro('S-1')
    await db.query(`UPDATE "Siniestro" SET "idUsuario" = $1 WHERE id = $2`, [bruno, caso])
    const novedad = (autor) =>
      uno(
        `INSERT INTO "NovedadSiniestro" (descripcion, autor, "idSiniestro", "idUsuario") VALUES ('N', $1, $2, $3) RETURNING id`,
        [autor, caso, bruno],
      )
    const deAna = await novedad('AnaLegado Prueba')
    const deBruno = await novedad('BrunoLegado Prueba')
    const repetido = await novedad('Juan Repetido')
    const desconocido = await novedad('Nadie Conocido')

    await db.query(await sql(NOVEDADES_AUTOR_HISTORICO))
    const { rows } = await db.query(
      `SELECT id, "idUsuario", autor, "tipoUsuarioAutor" FROM "NovedadSiniestro" ORDER BY id`,
    )
    assert.deepEqual(rows, [
      { id: deAna, idUsuario: ana, autor: 'AnaLegado Prueba', tipoUsuarioAutor: null },
      { id: deBruno, idUsuario: bruno, autor: 'BrunoLegado Prueba', tipoUsuarioAutor: null },
      { id: repetido, idUsuario: null, autor: 'Juan Repetido', tipoUsuarioAutor: null },
      { id: desconocido, idUsuario: null, autor: 'Nadie Conocido', tipoUsuarioAutor: null },
    ])
    // Cada envío del formulario carga una sola novedad
    await db.query(`UPDATE "NovedadSiniestro" SET "claveEnvio" = 'a' WHERE id = $1`, [deAna])
    await assert.rejects(
      db.query(`UPDATE "NovedadSiniestro" SET "claveEnvio" = 'a' WHERE id = $1`, [deBruno]),
      { code: '23505' },
    )
  } finally {
    await borrar()
  }
})

test('migración historial_autor: cada evento conserva el nombre y el rol de quien lo hizo', async () => {
  const migracion = '20261106120200_historial_autor'
  const { db, borrar } = await baseHasta(migracion)
  try {
    const { uno, siniestro } = await datosBase(db)
    const caso = await siniestro('S-1')
    const { rows: usuarios } = await db.query(`SELECT id FROM "Usuario"`)
    const autor = usuarios[0].id
    const evento = () =>
      uno(
        `INSERT INTO "HistorialSiniestro" ("tipoEvento", descripcion, "idSiniestro", "idUsuario")
         VALUES ('NOVEDAD', '-', $1, $2) RETURNING id`,
        [caso, autor],
      )
    const anterior = await evento()
    await db.query(await sql(migracion))
    // Los anteriores, con los datos de hoy (antes no se guardaban)
    await db.query(
      `UPDATE "Usuario" SET nombres = 'Nuevo', "tipoUsuario" = 'GESTOR' WHERE id = $1`,
      [autor],
    )
    // Los nuevos, con los del momento en que se registran, sin que la operación los mande
    const nuevo = await evento()
    await db.query(
      `UPDATE "Usuario" SET nombres = 'Otro', "tipoUsuario" = 'SUPER_ADMINISTRADOR' WHERE id = $1`,
      [autor],
    )
    const { rows } = await db.query(
      `SELECT id, "autorNombre", "autorTipoUsuario" FROM "HistorialSiniestro" ORDER BY id`,
    )
    assert.deepEqual(rows, [
      { id: anterior, autorNombre: 'A B', autorTipoUsuario: 'ADMINISTRADOR' },
      { id: nuevo, autorNombre: 'Nuevo B', autorTipoUsuario: 'GESTOR' },
    ])
  } finally {
    await borrar()
  }
})

test('migración historial_sin_alta_reconstruida: borra solo las altas deducidas de la primera asignación', async () => {
  const migracion = '20261106120300_historial_sin_alta_reconstruida'
  const { db, borrar } = await baseHasta(migracion)
  try {
    const { uno, siniestro } = await datosBase(db)
    const { rows: usuarios } = await db.query(`SELECT id FROM "Usuario"`)
    const autor = usuarios[0].id
    const evento = (idSiniestro, tipo, fecha) =>
      uno(
        `INSERT INTO "HistorialSiniestro" ("tipoEvento", descripcion, "fechaEvento", "idSiniestro", "idUsuario")
         VALUES ($1, '-', $2, $3, $4) RETURNING id`,
        [tipo, fecha, idSiniestro, autor],
      )
    const viejo = await siniestro('VIEJO')
    const nuevo = await siniestro('NUEVO')
    // La versión anterior de la rama dedujo esta alta: un milisegundo antes de la primera asignación
    await evento(viejo, 'ALTA_SINIESTRO', '2026-10-20T02:59:59.999Z')
    const asignacionVieja = await evento(viejo, 'ASIGNACION', '2026-10-20T03:00:00Z')
    // Un alta real comparte la hora con su asignación
    const altaReal = await evento(nuevo, 'ALTA_SINIESTRO', '2026-11-03T12:00:00Z')
    const asignacionNueva = await evento(nuevo, 'ASIGNACION', '2026-11-03T12:00:00Z')

    await db.query(await sql(migracion))
    const { rows } = await db.query(`SELECT id FROM "HistorialSiniestro" ORDER BY id`)
    assert.deepEqual(
      rows.map((r) => r.id),
      [asignacionVieja, altaReal, asignacionNueva],
    )
  } finally {
    await borrar()
  }
})

test('migración revision_datos_caso: conserva casos, historial y movimiento e inicia revisiones en cero', async () => {
  const migracion = '20261105120000_revision_datos_caso'
  const { db, borrar } = await baseHasta(migracion)
  try {
    const { siniestro } = await datosBase(db)
    const id = await siniestro('CONSERVAR')
    await db.query(
      `UPDATE "Siniestro" SET causa = 'Texto previo', demorado = true, "fechaUltimoMovimiento" = '2026-10-01T12:00:00Z' WHERE id = $1`,
      [id],
    )
    const anterior = (await db.query('SELECT * FROM "Siniestro" WHERE id = $1', [id])).rows[0]
    await db.query(await sql(migracion))
    const { revision, ...conservado } = (
      await db.query('SELECT * FROM "Siniestro" WHERE id = $1', [id])
    ).rows[0]
    assert.equal(revision, 0)
    assert.deepEqual(conservado, anterior)
    const nuevo = await siniestro('NUEVO')
    assert.equal(
      (await db.query('SELECT revision FROM "Siniestro" WHERE id = $1', [nuevo])).rows[0].revision,
      0,
    )
  } finally {
    await borrar()
  }
})

test('migración maestros_unicos: une relaciones sin perder expedientes, vehículos ni historial', async () => {
  const nombre = '20261105130000_maestros_unicos'
  const { db, borrar } = await baseHasta(nombre)
  try {
    const { uno, siniestro } = await datosBase(db)
    const s1 = await siniestro('S-1'),
      s2 = await siniestro('S-2')
    const original = (await db.query('SELECT * FROM "Siniestro" WHERE id = $1', [s1])).rows[0]
    const aseguradora = original.idAseguradora
    const duplicada = await uno(
      `INSERT INTO "Aseguradora" (nombre) VALUES (' PRUEBA ') RETURNING id`,
    )
    const ajustador = (idAseguradora, email) =>
      uno(
        `INSERT INTO "Ajustador" (nombres, apellidos, telefono, email, "idAseguradora") VALUES ('Ana', 'Pérez', '123', $2, $1) RETURNING id`,
        [idAseguradora, email],
      )
    const a1 = await ajustador(aseguradora, 'ana@example.invalid'),
      a2 = await ajustador(duplicada, ' ANA@EXAMPLE.INVALID ')
    await db.query('UPDATE "Siniestro" SET "idAjustador" = $2 WHERE id = $1', [s1, a1])
    await db.query(
      'UPDATE "Siniestro" SET "idAseguradora" = $2, "idAjustador" = $3 WHERE id = $1',
      [s2, duplicada, a2],
    )
    const v = await uno(
      `INSERT INTO "Vehiculo" (dominio, "idSiniestro", "idAseguradora") VALUES ('AA111AA', $1, $2) RETURNING id`,
      [s2, duplicada],
    )
    await db.query(
      `INSERT INTO "HistorialSiniestro" ("idSiniestro", "idUsuario", "tipoEvento", descripcion, "fechaEvento") VALUES ($1, $2, 'ASIGNACION', 'Evento previo', now())`,
      [s2, original.idUsuario],
    )
    const antes = (await db.query('SELECT * FROM "Siniestro" ORDER BY id')).rows
    const historial = (await db.query('SELECT * FROM "HistorialSiniestro" ORDER BY id')).rows
    await db.query(await sql(nombre))
    assert.equal((await db.query('SELECT count(*)::int n FROM "Aseguradora"')).rows[0].n, 1)
    assert.equal((await db.query('SELECT count(*)::int n FROM "Ajustador"')).rows[0].n, 1)
    assert.deepEqual(
      (await db.query('SELECT * FROM "Siniestro" ORDER BY id')).rows,
      antes.map((s) => ({ ...s, idAseguradora: aseguradora, idAjustador: a1 })),
    )
    assert.deepEqual(
      (await db.query('SELECT * FROM "HistorialSiniestro" ORDER BY id')).rows,
      historial,
    )
    assert.equal(
      (await db.query('SELECT "idAseguradora" FROM "Vehiculo" WHERE id = $1', [v])).rows[0]
        .idAseguradora,
      aseguradora,
    )
    await assert.rejects(db.query(`INSERT INTO "Aseguradora" (nombre) VALUES ('prueba')`), {
      code: '23505',
    })
    await assert.rejects(ajustador(aseguradora, ' ANA@example.invalid '), { code: '23505' })
  } finally {
    await borrar()
  }
})

test('migración maestros_unicos: si hay datos incompatibles o números que colisionan, no modifica nada', async () => {
  const nombre = '20261105130000_maestros_unicos'
  const { db, borrar } = await baseHasta(nombre)
  try {
    const { uno, siniestro } = await datosBase(db)
    const caso = await siniestro('MISMO')
    const a = (await db.query('SELECT "idAseguradora" FROM "Siniestro" WHERE id = $1', [caso]))
      .rows[0].idAseguradora
    const b = await uno(
      `INSERT INTO "Aseguradora" (nombre, eliminado, "fechaBaja") VALUES ('prueba', true, now()) RETURNING id`,
    )
    await assert.rejects(db.query(await sql(nombre)), /estados distintos/)
    await db.query('ROLLBACK')
    assert.equal((await db.query('SELECT count(*)::int n FROM "Aseguradora"')).rows[0].n, 2)
    await db.query('UPDATE "Aseguradora" SET eliminado = false, "fechaBaja" = null WHERE id = $1', [
      b,
    ])
    await db.query(
      `INSERT INTO "Ajustador" (nombres, apellidos, email, telefono, "idAseguradora") VALUES ('Ana', 'A', 'x@example.invalid', '1', $1), ('Otra', 'B', 'X@example.invalid', '2', $2)`,
      [a, b],
    )
    await assert.rejects(db.query(await sql(nombre)), /datos distintos/)
    await db.query('ROLLBACK')
    assert.equal((await db.query('SELECT count(*)::int n FROM "Ajustador"')).rows[0].n, 2)
    await db.query(`UPDATE "Ajustador" SET email = 'otro@example.invalid' WHERE nombres = 'Otra'`)
    const otro = await siniestro('OTRO')
    await db.query(
      `UPDATE "Siniestro" SET "numeroSiniestro" = 'mismo', "idAseguradora" = $2 WHERE id = $1`,
      [otro, b],
    )
    await assert.rejects(db.query(await sql(nombre)), /repetiría números/)
    await db.query('ROLLBACK')
    assert.equal((await db.query('SELECT count(*)::int n FROM "Siniestro"')).rows[0].n, 2)
  } finally {
    await borrar()
  }
})

test('migración semaforo_demora: borra la bandera guardada sin tocar los casos y suma los avisos de demora', async () => {
  const migracion = '20261107120000_semaforo_demora'
  const { db, borrar } = await baseHasta(migracion)
  try {
    const { siniestro } = await datosBase(db)
    const id = await siniestro('S-1')
    await db.query(
      `UPDATE "Siniestro" SET demorado = true, "fechaUltimoMovimiento" = '2026-10-01T12:00:00Z' WHERE id = $1`,
      [id],
    )
    const { demorado: _, ...anterior } = (
      await db.query('SELECT * FROM "Siniestro" WHERE id = $1', [id])
    ).rows[0]
    await db.query(await sql(migracion))
    const despues = (await db.query('SELECT * FROM "Siniestro" WHERE id = $1', [id])).rows[0]
    assert.deepEqual(despues, anterior, 'el caso queda igual, sin la columna')
    const { rows } = await db.query(
      `SELECT unnest(enum_range(NULL::"TipoNotificacion"))::text AS tipo`,
    )
    assert.ok(['CASO_DEMORADO', 'CASO_EN_ALERTA'].every((t) => rows.some((r) => r.tipo === t)))
  } finally {
    await borrar()
  }
})

test('migración de carga: se agrega después de desarrollo sin renombrar ni perder documentos existentes', async () => {
  const carga = '20261106120000_carga_documentos_idempotente'
  const { db, borrar } = await baseHasta('99999999999999', [carga])
  try {
    const direccion = (await db.query('INSERT INTO "Direccion" DEFAULT VALUES RETURNING id'))
      .rows[0].id
    const usuario = (
      await db.query(
        `INSERT INTO "Usuario" (nombres, apellidos, documento, telefono, email, contrasena, "tipoUsuario", "idDireccion") VALUES ('Autor', 'Prueba', '0', '0', 'carga@example.invalid', '-', 'GESTOR', $1) RETURNING id`,
        [direccion],
      )
    ).rows[0].id
    const estado = (
      await db.query(
        `INSERT INTO "EstadoSiniestro" (nombre, descripcion) VALUES ('Abierto', '-') RETURNING id`,
      )
    ).rows[0].id
    const aseguradora = (
      await db.query(
        `INSERT INTO "Aseguradora" (nombre) VALUES ('Prueba de actualización') RETURNING id`,
      )
    ).rows[0].id
    const siniestro = (
      await db.query(
        `INSERT INTO "Siniestro" ("numeroSiniestro", "numeroPoliza", "fechaAsignacion", "menorEdadInvolucrado", "idEstadoSiniestro", "idAseguradora", "idUsuario") VALUES ('MIG-CARGA', 'P', now(), false, $1, $2, $3) RETURNING id`,
        [estado, aseguradora, usuario],
      )
    ).rows[0].id
    const documento = (
      await db.query(
        `INSERT INTO "DocumentoSiniestro" ("nombreOriginal", "urlArchivoSinDominio", "tipoExtension", "mimeType", "tamanoBytes", "idUsuario", "idSiniestro") VALUES ('Original.pdf', 'siniestros/prueba/original.pdf', 'pdf', 'application/pdf', 123, $1, $2) RETURNING *`,
        [usuario, siniestro],
      )
    ).rows[0]
    await db.query(await sql(carga))
    const actualizado = (
      await db.query('SELECT * FROM "DocumentoSiniestro" WHERE id=$1', [documento.id])
    ).rows[0]
    assert.deepEqual(actualizado, { ...documento, idCarga: null, hashContenido: null })
    const uuid = '37a87f2e-d34e-4716-a331-7dc5a50edbaf'
    await db.query('UPDATE "DocumentoSiniestro" SET "idCarga"=$1, "hashContenido"=$2 WHERE id=$3', [
      uuid,
      'a'.repeat(64),
      documento.id,
    ])
    await assert.rejects(
      db.query(
        `INSERT INTO "DocumentoSiniestro" ("nombreOriginal", "urlArchivoSinDominio", "tipoExtension", "mimeType", "tamanoBytes", "idUsuario", "idSiniestro", "idCarga") VALUES ('Duplicado.pdf', 'siniestros/prueba/duplicado.pdf', 'pdf', 'application/pdf', 123, $1, $2, $3)`,
        [usuario, siniestro, uuid],
      ),
      { code: '23505' },
    )
    assert.equal(
      (
        await db.query(
          `SELECT count(*)::int AS cantidad FROM information_schema.columns WHERE table_name='Siniestro' AND column_name='demorado'`,
        )
      ).rows[0].cantidad,
      0,
    )
  } finally {
    await borrar()
  }
})
