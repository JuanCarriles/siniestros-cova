import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'
import express from 'express'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioBajaDocumento } from '../src/modules/documentos/documentos-baja.service.ts'
import { crearServicioDocumentosFicha } from '../src/modules/documentos/documentos-ficha.service.ts'
import { crearServicioArchivosDocumento } from '../src/modules/documentos/documentos-archivos.service.ts'
import { crearSiniestrosRouter } from '../src/modules/siniestros/siniestros.routes.ts'
import { errorHandler, notFound } from '../src/middlewares/errorHandler.ts'

test(
  'CU-10: consulta privada, baja auditada, límites, concurrencia y reversión',
  { timeout: 90000 },
  async (t) => {
    const original = process.env.DATABASE_URL
    const url = new URL(original)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    const nombre = `cova_test_consulta_${Date.now()}_${process.pid}`
    const control = new pg.Client({ connectionString: original })
    await control.connect()
    let creada = false,
      server,
      bloqueo
    try {
      await control.query(`CREATE DATABASE "${nombre}"`)
      creada = true
      url.pathname = '/' + nombre
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
      const usuario = (n, tipoUsuario) =>
        db.usuario.create({
          data: {
            nombres: n,
            apellidos: 'Prueba',
            email: n + '@example.invalid',
            tipoUsuario,
            documento: '0',
            telefono: '0',
            contrasena: '-',
            direccion: { create: {} },
          },
        })
      const gestor = await usuario('Gestor', 'GESTOR'),
        otro = await usuario('Otro', 'GESTOR'),
        admin = await usuario('Admin', 'ADMINISTRADOR'),
        superadmin = await usuario('Super', 'SUPER_ADMINISTRADOR')
      const estado = await db.estadoSiniestro.create({
        data: { nombre: 'Activo', descripcion: 'Abierto' },
      })
      const cerrado = await db.estadoSiniestro.create({
        data: { nombre: 'Final', descripcion: 'Cerrado', esCierre: true },
      })
      const aseguradora = await db.aseguradora.create({ data: { nombre: 'Prueba consulta' } })
      const crearCaso = (n) =>
        db.siniestro.create({
          data: {
            numeroSiniestro: n,
            numeroPoliza: 'P',
            fechaAsignacion: new Date(),
            idEstadoSiniestro: estado.id,
            idAseguradora: aseguradora.id,
            idUsuario: gestor.id,
            menorEdadInvolucrado: false,
            demorado: false,
          },
        })
      const caso = await crearCaso('CONSULTA'),
        ajeno = await crearCaso('AJENO')
      const ahora = new Date('2026-11-04T15:00:00Z')
      let numero = 0,
        actor = gestor
      const crearDoc = (extra = {}) =>
        db.documentoSiniestro.create({
          data: {
            idSiniestro: caso.id,
            idUsuario: gestor.id,
            nombreOriginal: 'Acta.pdf',
            tipoExtension: 'pdf',
            mimeType: 'application/pdf',
            tamanoBytes: 16n,
            urlArchivoSinDominio: `siniestros/${caso.id}/${++numero}.pdf`,
            fechaCarga: ahora,
            ...extra,
          },
        })
      const contenido = Buffer.from('%PDF-1.7 prueba')
      const r2 = {
        comprobarExistencia: async () => {},
        leerParaVista: async () => contenido,
        firmarDescarga: async () => ({ url: 'https://example.invalid/privado?X-Amz-Expires=60' }),
      }
      const transaccion = (trabajo) => db.$transaction(trabajo, { timeout: 15000 })
      const baja = crearServicioBajaDocumento(transaccion, () => ahora)
      const lista = crearServicioDocumentosFicha(db, () => ahora)
      const archivos = crearServicioArchivosDocumento(db, () => r2)
      const app = express()
      app.use(express.json())
      app.use(
        '/api/siniestros',
        crearSiniestrosRouter({
          documentosBaja: baja,
          documentosArchivos: archivos,
          ficha: { documentos: lista },
          requerirSesion: (req, _res, next) => {
            req.usuario = actor
            req.sesion = { usuario: actor }
            next()
          },
        }),
      )
      app.use(notFound, errorHandler)
      server = app.listen(0, '127.0.0.1')
      await once(server, 'listening')
      const base = `http://127.0.0.1:${server.address().port}/api/siniestros`
      const pedir = (path, body) =>
        fetch(
          base + path,
          body === undefined
            ? { redirect: 'manual' }
            : {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              },
        )
      const ruta = (d, id = caso.id) => `/${id}/documentos/${d.id}`

      await t.test(
        'PDF privado y descarga firmada; prohíbe otros expedientes y documentos ajenos al caso',
        async () => {
          const d = await crearDoc()
          const r = await pedir(ruta(d) + '/contenido')
          assert.equal(r.status, 200, await r.clone().text())
          assert.deepEqual(Buffer.from(await r.arrayBuffer()), contenido)
          assert.equal(r.headers.get('cache-control'), 'private, no-store')
          assert.match(r.headers.get('content-disposition'), /^attachment/)
          assert.equal((await pedir(ruta(d) + '/original')).status, 302)
          assert.equal((await pedir(ruta(d, ajeno.id) + '/contenido')).status, 404)
          actor = otro
          assert.equal((await pedir(ruta(d) + '/contenido')).status, 403)
          actor = gestor
        },
      )
      await t.test(
        'baja lógica con motivo: conserva fila, claves y movimiento; desaparece y revoca accesos nuevos',
        async () => {
          const d = await crearDoc(),
            antes = await db.siniestro.findUniqueOrThrow({ where: { id: caso.id } })
          assert.equal(
            (await lista.listar(gestor, caso.id)).find((x) => x.id === d.id).baja.permitida,
            true,
          )
          assert.equal(
            (await pedir(ruta(d) + '/baja', { motivo: '  Documento incorrecto  ' })).status,
            204,
          )
          const despues = await db.documentoSiniestro.findUniqueOrThrow({ where: { id: d.id } })
          assert.equal(despues.eliminado, true)
          assert.equal(despues.idUsuarioBaja, gestor.id)
          assert.equal(despues.motivoBaja, 'Documento incorrecto')
          assert.deepEqual(despues.fechaBaja, ahora)
          assert.equal(despues.urlArchivoSinDominio, d.urlArchivoSinDominio)
          assert.equal(
            (await lista.listar(gestor, caso.id)).some((x) => x.id === d.id),
            false,
          )
          assert.deepEqual(
            (await db.siniestro.findUniqueOrThrow({ where: { id: caso.id } }))
              .fechaUltimoMovimiento,
            antes.fechaUltimoMovimiento,
          )
          const h = await db.historialSiniestro.findMany({ where: { idSiniestro: caso.id } })
          assert.equal(h.length, 1)
          assert.equal(h[0].idUsuario, gestor.id)
          assert.deepEqual(h[0].fechaEvento, ahora)
          assert.match(h[0].descripcion, /Documento incorrecto/)
          for (const tipo of ['original', 'vista', 'miniatura', 'contenido'])
            assert.equal((await pedir(ruta(d) + '/' + tipo)).status, 404)
          assert.equal((await pedir(ruta(d) + '/baja', { motivo: 'Otra baja' })).status, 409)
        },
      )
      await t.test(
        '48 horas, autor, rol actual, motivo obligatorio y administrador sin límite',
        async () => {
          const viejo = await crearDoc({
              fechaCarga: new Date(ahora.getTime() - 48 * 3600000 - 1),
            }),
            ajeno = await crearDoc({ idUsuario: otro.id }),
            borde = await crearDoc({ fechaCarga: new Date(ahora.getTime() - 48 * 3600000) })
          for (const d of [viejo, ajeno])
            assert.equal((await pedir(ruta(d) + '/baja', { motivo: 'Prueba' })).status, 403)
          for (const body of [
            { motivo: '  ' },
            { motivo: 'x'.repeat(1001) },
            { motivo: 'Prueba', idUsuario: admin.id },
          ])
            assert.equal((await pedir(ruta(borde) + '/baja', body)).status, 400)
          actor = { ...gestor, tipoUsuario: 'ADMINISTRADOR' }
          assert.equal(
            (await pedir(ruta(viejo) + '/baja', { motivo: 'Rol de sesión viejo' })).status,
            403,
          )
          actor = gestor
          assert.equal(
            (await pedir(ruta(borde) + '/baja', { motivo: 'Dentro del plazo' })).status,
            204,
          )
          actor = admin
          assert.equal(
            (await pedir(ruta(viejo) + '/baja', { motivo: 'Corrección administrativa' })).status,
            204,
          )
          actor = superadmin
          assert.equal(
            (await pedir(ruta(ajeno) + '/baja', { motivo: 'Corrección administrativa' })).status,
            204,
          )
          actor = gestor
        },
      )
      await t.test('dos confirmaciones simultáneas producen una sola baja y evento', async () => {
        const d = await crearDoc(),
          antes = await db.historialSiniestro.count()
        const respuestas = await Promise.all([
          pedir(ruta(d) + '/baja', { motivo: 'Una sola baja' }),
          pedir(ruta(d) + '/baja', { motivo: 'Una sola baja' }),
        ])
        assert.deepEqual(respuestas.map((r) => r.status).sort(), [204, 409])
        assert.equal(await db.historialSiniestro.count(), antes + 1)
      })
      await t.test('si falla el historial se revierte la baja', async () => {
        const d = await crearDoc()
        const roto = crearServicioBajaDocumento(
          (trabajo) =>
            transaccion((tx) =>
              trabajo(
                new Proxy(tx, {
                  get: (obj, prop) =>
                    prop === 'historialSiniestro'
                      ? {
                          create: async () => {
                            throw new Error('Fallo de historial')
                          },
                        }
                      : obj[prop],
                }),
              ),
            ),
          () => ahora,
        )
        await assert.rejects(
          roto.darDeBaja(gestor, caso.id, d.id, { motivo: 'No debe guardarse' }),
          /Fallo de historial/,
        )
        assert.equal(
          (await db.documentoSiniestro.findUniqueOrThrow({ where: { id: d.id } })).eliminado,
          false,
        )
      })
      await t.test(
        'revalida el responsable después de esperar un bloqueo concurrente',
        async () => {
          const d = await crearDoc()
          bloqueo = new pg.Client({ connectionString: url.href })
          await bloqueo.connect()
          await bloqueo.query('BEGIN')
          await bloqueo.query('SELECT id FROM "Siniestro" WHERE id=$1 FOR UPDATE', [caso.id])
          const pendiente = baja.darDeBaja(gestor, caso.id, d.id, { motivo: 'Ya no es mío' })
          const resultado = pendiente.then(
            () => 'permitido',
            (e) => e.status,
          )
          let esperando = false
          for (let i = 0; i < 100 && !esperando; i++) {
            esperando = (
              await bloqueo.query(
                'SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND cardinality(pg_blocking_pids(pid))>0) AS esperando',
                [nombre],
              )
            ).rows[0].esperando
            if (!esperando) await new Promise((resolve) => setTimeout(resolve, 20))
          }
          assert.equal(esperando, true)
          await bloqueo.query('UPDATE "Siniestro" SET "idUsuario"=$1 WHERE id=$2', [
            otro.id,
            caso.id,
          ])
          await bloqueo.query('COMMIT')
          await bloqueo.end()
          bloqueo = null
          assert.equal(await resultado, 403)
          assert.equal(
            (await db.documentoSiniestro.findUniqueOrThrow({ where: { id: d.id } })).eliminado,
            false,
          )
          await db.siniestro.update({ where: { id: caso.id }, data: { idUsuario: gestor.id } })
        },
      )
      await t.test(
        'caso cerrado o dado de baja: consulta administrativa pero no permite bajas nuevas',
        async () => {
          const d = await crearDoc()
          actor = admin
          await db.siniestro.update({
            where: { id: caso.id },
            data: { idEstadoSiniestro: cerrado.id },
          })
          assert.equal((await pedir(ruta(d) + '/baja', { motivo: 'No editable' })).status, 409)
          await db.siniestro.update({
            where: { id: caso.id },
            data: { idEstadoSiniestro: estado.id, eliminado: true, fechaBaja: ahora },
          })
          assert.equal((await pedir(ruta(d) + '/contenido')).status, 200)
          assert.equal((await pedir(ruta(d) + '/baja', { motivo: 'No editable' })).status, 409)
        },
      )
    } finally {
      if (bloqueo) {
        await bloqueo.query('ROLLBACK')
        await bloqueo.end()
      }
      if (server) {
        server.closeAllConnections()
        await new Promise((resolve) => server.close(resolve))
      }
      await disconnectPrisma()
      process.env.DATABASE_URL = original
      if (creada) {
        await control.query(
          'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',
          [nombre],
        )
        await control.query(`DROP DATABASE "${nombre}"`)
      }
      await control.end()
    }
  },
)
