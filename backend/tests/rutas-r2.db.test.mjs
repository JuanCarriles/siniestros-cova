import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { asegurarCarpetaSiniestroR2 } from '../src/modules/documentos/carpeta-siniestro.ts'
import { reorganizarArchivosR2 } from '../src/modules/documentos/reorganizar-r2.service.ts'
import { crearServicioBajasSiniestros } from '../src/modules/siniestros/siniestros-bajas.service.ts'
import { perteneceClaveSiniestroR2 } from '../src/lib/rutas-r2.ts'

test(
  'R2: carpetas únicas concurrentes, estabilidad, simulación, reorganización con derivados y rollback',
  { timeout: 90000 },
  async (t) => {
    const original = process.env.DATABASE_URL,
      url = new URL(original)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    const nombre = `cova_test_rutas_r2_${Date.now()}_${process.pid}`
    const control = new pg.Client({ connectionString: original })
    await control.connect()
    let creada = false
    try {
      await control.query(`CREATE DATABASE "${nombre}"`)
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
      const db = getPrisma()
      const usuario = await db.usuario.create({
        data: {
          nombres: 'Prueba',
          apellidos: 'Rutas',
          email: 'rutas@example.invalid',
          documento: '0',
          telefono: '0',
          contrasena: '-',
          tipoUsuario: 'ADMINISTRADOR',
          direccion: { create: {} },
        },
      })
      const estado = await db.estadoSiniestro.create({
        data: { nombre: 'Activo', descripcion: 'Abierto' },
      })
      const aseguradoras = await Promise.all(
        ['A', 'B'].map((nombre) => db.aseguradora.create({ data: { nombre } })),
      )
      const crear = (numeroSiniestro, idAseguradora = aseguradoras[0].id) =>
        db.siniestro.create({
          data: {
            numeroSiniestro,
            numeroPoliza: '1',
            fechaAsignacion: new Date(),
            idEstadoSiniestro: estado.id,
            idAseguradora,
            idUsuario: usuario.id,
            menorEdadInvolucrado: false,
          },
        })
      const a = await crear('1'),
        b = await crear('1', aseguradoras[1].id)
      assert.equal(a.carpetaR2, null)
      const estadisticasAntes = await db.registroEstadisticoSiniestro.count()
      const reservas = await Promise.all(
        [a, b].map((caso) => db.$transaction((tx) => asegurarCarpetaSiniestroR2(tx, caso.id))),
      )
      assert.equal(
        await db.registroEstadisticoSiniestro.count(),
        estadisticasAntes,
        'reservar carpetas no inventa actividad estadística',
      )
      assert.equal(new Set(reservas).size, 2)
      // Una sola carpeta {nºsiniestro}-{nºpóliza}; el segundo con los mismos números lleva su id
      assert.ok(reservas.includes('siniestros/1-1'))
      const duplicado = reservas[0] !== 'siniestros/1-1' ? a : b
      assert.ok(reservas.includes(`siniestros/1-1-id${duplicado.id}`))
      await db.siniestro.update({
        where: { id: a.id },
        data: { numeroSiniestro: 'CAMBIADO', numeroPoliza: 'OTRA' },
      })
      assert.equal(await db.$transaction((tx) => asegurarCarpetaSiniestroR2(tx, a.id)), reservas[0])
      const caso = await crear('2'),
        objetos = new Map(),
        copias = []
      let fallar = ''
      const r2 = {
        entorno: 'dev',
        comprobarExistencia: async (clave) => {
          assert.ok(objetos.has(clave), `Falta ${clave}`)
        },
        listar: async () => [...objetos].map(([clave, b]) => ({ clave, bytes: b.length })),
        copiar: async (origen, carpeta, nombre) => {
          if (origen === fallar) throw Error('Falla controlada de copia')
          const destino = `dev/${carpeta}/${nombre ?? origen.split('/').pop()}`
          copias.push({ origen, destino })
          objetos.set(destino, objetos.get(origen))
          return destino
        },
      }
      const keys = [
        `siniestros/${caso.id}/foto.jpg`,
        `siniestros/${caso.id}/foto.jpg.vista.webp`,
        `siniestros/${caso.id}/foto.jpg.miniatura.webp`,
      ]
      for (const key of keys) objetos.set(key, Buffer.from(key))
      const documento = await db.documentoSiniestro.create({
        data: {
          idSiniestro: caso.id,
          idUsuario: usuario.id,
          nombreOriginal: 'foto.jpg',
          tipoExtension: 'jpg',
          mimeType: 'image/jpeg',
          tamanoBytes: 12n,
          urlArchivoSinDominio: keys[0],
          claveImagenOptimizada: keys[1],
          claveMiniatura: keys[2],
          eliminado: true,
          fechaBaja: new Date(),
          motivoBaja: 'Prueba',
        },
      })
      const plantilla = await db.documentoPlantilla.create({
        data: {
          nombreOriginal: 'Acta.pdf',
          encabezado: 'Acta',
          tipoExtension: 'pdf',
          idUsuario: usuario.id,
          urlArchivo: 'plantillas/acta.pdf',
        },
      })
      const clavePdf = 'informes mensuales/2026/11/11111111-1111-4111-8111-111111111111.pdf'
      objetos.set(plantilla.urlArchivo, Buffer.from('pdf'))
      objetos.set(clavePdf, Buffer.from('pdf'))
      const informe = await db.informeMensual.create({
        data: { periodo: '2026-11', clavePeriodo: '2026-11', clavePdf },
      })
      const ejecutar = (aplicar) => reorganizarArchivosR2({ db, r2, entorno: 'dev', aplicar })
      const resumen = ({ aplicado, registros, archivos, omitidos }) => ({
        aplicado,
        registros,
        archivos,
        omitidos,
      })
      const simulacion = await ejecutar(false)
      assert.deepEqual(resumen(simulacion), {
        aplicado: false,
        registros: 3,
        archivos: 5,
        omitidos: 0,
      })
      assert.deepEqual(simulacion.sobrantes, [], 'antes de reorganizar, la base usa todo')
      assert.equal(copias.length, 0)
      assert.equal(
        (await db.siniestro.findUniqueOrThrow({ where: { id: caso.id } })).carpetaR2,
        null,
      )
      fallar = keys[2]
      await assert.rejects(ejecutar(true), /Falla controlada/)
      const anterior = await db.documentoSiniestro.findUniqueOrThrow({
        where: { id: documento.id },
      })
      assert.equal(anterior.urlArchivoSinDominio, keys[0])
      assert.equal(anterior.claveImagenOptimizada, keys[1])
      assert.equal(anterior.claveMiniatura, keys[2])
      assert.equal(
        (await db.siniestro.findUniqueOrThrow({ where: { id: caso.id } })).carpetaR2,
        null,
      )
      for (const key of keys) assert.ok(objetos.has(key), 'no borra los originales ante un fallo')
      fallar = ''
      const aplicada = await ejecutar(true)
      assert.deepEqual(resumen(aplicada), {
        aplicado: true,
        registros: 3,
        archivos: 5,
        omitidos: 0,
      })
      // Lo anterior no se borra: queda como sobrante, para retirarlo a mano después de verificar
      assert.deepEqual(
        new Set(aplicada.sobrantes.map((o) => o.clave)),
        new Set([...keys, 'plantillas/acta.pdf', clavePdf]),
      )
      const actualizado = await db.documentoSiniestro.findUniqueOrThrow({
        where: { id: documento.id },
      })
      for (const field of ['urlArchivoSinDominio', 'claveImagenOptimizada', 'claveMiniatura']) {
        assert.ok(actualizado[field].startsWith('dev/siniestros/2-1/'), actualizado[field])
        assert.ok(objetos.has(actualizado[field]))
      }
      // Nombre legible, y los derivados conservan el nombre del principal
      assert.match(actualizado.urlArchivoSinDominio, /^dev\/siniestros\/2-1\/foto-[a-z0-9]+\.jpg$/)
      assert.equal(
        actualizado.claveImagenOptimizada,
        `${actualizado.urlArchivoSinDominio}.vista.webp`,
      )
      assert.equal(actualizado.claveMiniatura, `${actualizado.urlArchivoSinDominio}.miniatura.webp`)
      assert.equal(actualizado.eliminado, true, 'la reorganización no reactiva documentos')
      assert.equal(actualizado.fechaCarga.toISOString(), documento.fechaCarga.toISOString())
      assert.match(
        (await db.documentoPlantilla.findUniqueOrThrow({ where: { id: plantilla.id } })).urlArchivo,
        /^dev\/plantillas\/acta-[a-z0-9]+\.pdf$/,
      )
      assert.equal(
        (await db.informeMensual.findUniqueOrThrow({ where: { id: informe.id } })).clavePdf,
        'dev/informes/2026/2026-11-11111111.pdf',
        'informes/{AAAA}/{AAAA-MM}-{código}.pdf, con el código del nombre anterior',
      )
      assert.deepEqual(resumen(await ejecutar(true)), {
        aplicado: true,
        registros: 0,
        archivos: 0,
        omitidos: 0,
      })
      assert.equal(
        await db.documentoSiniestro.count(),
        1,
        'reintentar no crea documentos adicionales',
      )
      const conCarpeta = await db.siniestro.findUniqueOrThrow({ where: { id: caso.id } })
      assert.equal(
        perteneceClaveSiniestroR2(actualizado.urlArchivoSinDominio, conCarpeta, 'dev'),
        true,
      )
      await db.documentoSiniestro.update({
        where: { id: documento.id },
        data: {
          urlArchivoSinDominio: actualizado.urlArchivoSinDominio.replace(/^dev\//, 'produccion/'),
        },
      })
      const antes = copias.length
      // Un caso con un archivo de otro entorno no se toca: se informa y se sigue con los demás
      const conAjena = await ejecutar(true)
      assert.equal(conAjena.omitidos, 1)
      assert.equal(copias.length, antes, 'una referencia ajena no se copia')
      // El borrado definitivo debe reconocer también la carpeta nueva y todos sus derivados.
      await db.documentoSiniestro.update({
        where: { id: documento.id },
        data: { urlArchivoSinDominio: actualizado.urlArchivoSinDominio },
      })
      const cerrado = await db.estadoSiniestro.create({
        data: { nombre: 'Final', descripcion: 'Cerrado', esCierre: true },
      })
      await db.siniestro.update({
        where: { id: caso.id },
        data: { eliminado: true, fechaBaja: new Date(), idEstadoSiniestro: cerrado.id },
      })
      const borradas = []
      const bajas = crearServicioBajasSiniestros({
        base: { transaccion: (trabajo) => db.$transaction(trabajo) },
        almacenamiento: () => ({ eliminar: async (clave) => borradas.push(clave) }),
      })
      await bajas.eliminar(usuario, caso.id, { numeroSiniestro: caso.numeroSiniestro })
      assert.equal(await db.siniestro.findUnique({ where: { id: caso.id } }), null)
      assert.deepEqual(
        new Set(borradas),
        new Set([
          actualizado.urlArchivoSinDominio,
          actualizado.claveImagenOptimizada,
          actualizado.claveMiniatura,
        ]),
      )
      assert.equal(await db.siniestro.count(), 2, 'los demás siniestros se conservan')
      await t.test('el adaptador y el entorno solicitado deben coincidir', async () => {
        await assert.rejects(
          reorganizarArchivosR2({ db, r2, entorno: 'produccion', aplicar: true }),
          { status: 400 },
        )
      })
    } finally {
      await disconnectPrisma()
      process.env.DATABASE_URL = original
      if (creada) await control.query(`DROP DATABASE "${nombre}" WITH (FORCE)`)
      await control.end()
    }
  },
)
