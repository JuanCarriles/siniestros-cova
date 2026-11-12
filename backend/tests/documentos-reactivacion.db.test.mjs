import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Readable } from 'node:stream'
import { once } from 'node:events'
import express from 'express'
import pg from 'pg'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioDocumentosFicha } from '../src/modules/documentos/documentos-ficha.service.ts'
import { crearServicioBajaDocumento } from '../src/modules/documentos/documentos-baja.service.ts'
import { crearServicioReactivacionDocumento } from '../src/modules/documentos/documentos-reactivacion.service.ts'
import { crearServicioArchivosDocumento } from '../src/modules/documentos/documentos-archivos.service.ts'
import { crearSiniestrosRouter } from '../src/modules/siniestros/siniestros.routes.ts'
import { HttpError } from '../src/utils/httpError.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'

test(
  'documentos: filtro, consulta privada y reactivación administrativa segura sin duplicar archivos',
  { timeout: 90000 },
  async () => {
    const original = process.env.DATABASE_URL,
      url = new URL(original)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    const nombre = `cova_test_reactivar_docs_${Date.now()}_${process.pid}`
    const control = new pg.Client({ connectionString: original, connectionTimeoutMillis: 4000 })
    await control.connect()
    let creada = false,
      server
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
      const db = getPrisma(),
        ahora = new Date('2026-11-12T18:00:00Z')
      const usuario = (n, tipoUsuario) =>
        db.usuario.create({
          data: {
            nombres: n,
            apellidos: 'Prueba',
            email: `${n}@example.invalid`,
            documento: '0',
            telefono: '0',
            contrasena: '-',
            tipoUsuario,
            direccion: { create: {} },
          },
        })
      const admin = await usuario('Admin', 'ADMINISTRADOR'),
        superadmin = await usuario('Super', 'SUPER_ADMINISTRADOR'),
        gestor = await usuario('Gestor', 'GESTOR'),
        otro = await usuario('Otro', 'GESTOR')
      let actor = admin
      const abierto = await db.estadoSiniestro.create({
        data: { nombre: 'Abierto', descripcion: 'Activo' },
      })
      const cerrado = await db.estadoSiniestro.create({
        data: { nombre: 'Final', descripcion: 'Final', esCierre: true },
      })
      const aseguradora = await db.aseguradora.create({ data: { nombre: 'Prueba reactivar' } })
      const crearCaso = (numeroSiniestro) =>
        db.siniestro.create({
          data: {
            numeroSiniestro,
            numeroPoliza: 'POL',
            idUsuario: gestor.id,
            idEstadoSiniestro: abierto.id,
            idAseguradora: aseguradora.id,
            menorEdadInvolucrado: false,
            fechaAsignacion: ahora,
            fechaUltimoMovimiento: ahora,
          },
        })
      const caso = await crearCaso('REACTIVAR'),
        ajeno = await crearCaso('OTRO')
      const doc = await db.documentoSiniestro.create({
        data: {
          nombreOriginal: 'Acta.pdf',
          tipoExtension: 'pdf',
          mimeType: 'application/pdf',
          tamanoBytes: 12n,
          idSiniestro: caso.id,
          idUsuario: gestor.id,
          fechaCarga: new Date(ahora.getTime() - 49 * 3600000),
          urlArchivoSinDominio: `siniestros/${caso.id}/acta.pdf`,
        },
      })
      let errorR2 = 0,
        heads = 0,
        despuesHead = async () => {}
      const r2 = {
        entorno: 'dev',
        comprobarExistencia: async () => {
          heads++
          if (errorR2) throw new HttpError(errorR2, 'Falla controlada')
          await despuesHead()
        },
        firmarDescarga: async () => ({
          url: 'https://example.invalid/firmada',
          venceEnSegundos: 60,
        }),
        leerParaVista: async () => Readable.from([Buffer.from('%PDF-1.4 Prueba')]),
      }
      const transaccion = (trabajo) => db.$transaction(trabajo, { timeout: 15000 })
      const baja = crearServicioBajaDocumento(transaccion, () => ahora)
      const deps = { transaccion, almacenamiento: () => r2 }
      const reactivar = crearServicioReactivacionDocumento(deps, () => ahora)
      const app = express()
      app.use(express.json())
      app.use(
        '/api/siniestros',
        crearSiniestrosRouter({
          documentosBaja: baja,
          documentosReactivacion: reactivar,
          documentosArchivos: crearServicioArchivosDocumento(db, () => r2),
          ficha: { documentos: crearServicioDocumentosFicha(db, () => ahora) },
          requerirSesion: (req, _res, next) => {
            req.usuario = actor
            req.sesion = { usuario: actor }
            next()
          },
        }),
      )
      app.use(errorHandler)
      server = app.listen(0, '127.0.0.1')
      await once(server, 'listening')
      const base = `http://127.0.0.1:${server.address().port}/api/siniestros`
      const ruta = `/${caso.id}/documentos/${doc.id}`
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
      await baja.darDeBaja(admin, caso.id, doc.id, { motivo: 'Documento retirado por error' })
      assert.equal((await (await pedir(`/${caso.id}/documentos`)).json()).length, 0)
      const lista = await (await pedir(`/${caso.id}/documentos?bajas=true`)).json()
      assert.equal(lista.length, 1)
      assert.equal(lista[0].eliminado, true)
      assert.equal(lista[0].motivoBaja, 'Documento retirado por error')
      assert.equal(lista[0].fechaBaja, ahora.toISOString())
      assert.equal(lista[0].autorBaja.nombre, 'Admin Prueba')
      assert.equal(lista[0].reactivacion.permitida, true)
      for (const campo of [
        'urlArchivoSinDominio',
        'claveMiniatura',
        'claveImagenOptimizada',
        'idUsuario',
      ])
        assert.equal(campo in lista[0], false)
      assert.equal((await pedir(ruta + '/original')).status, 404)
      assert.equal((await pedir(ruta + '/original?bajas=true')).status, 302)
      const pdf = await pedir(ruta + '/contenido?bajas=true')
      assert.equal(pdf.status, 200)
      assert.match(pdf.headers.get('content-disposition'), /^attachment/)
      for (const query of ['bajas=1', 'bajas[]=true', 'bajas=true&rol=ADMINISTRADOR'])
        assert.equal((await pedir(`/${caso.id}/documentos?${query}`)).status, 400)
      assert.equal((await pedir(ruta + '/original?bajas=inventado')).status, 400)
      actor = gestor
      assert.equal(
        (await (await pedir(`/${caso.id}/documentos?bajas=true`)).json())[0].reactivacion.permitida,
        false,
      )
      const antesHeads = heads
      assert.equal((await pedir(ruta + '/reactivacion', {})).status, 403)
      actor = { ...gestor, tipoUsuario: 'ADMINISTRADOR' }
      assert.equal(
        (await pedir(ruta + '/reactivacion', {})).status,
        403,
        'el rol real de la base prevalece',
      )
      assert.equal(heads, antesHeads, 'no consulta R2 si no tiene permiso')
      actor = otro
      assert.equal((await pedir(`/${caso.id}/documentos?bajas=true`)).status, 403)
      assert.equal((await pedir(ruta + '/original?bajas=true')).status, 403)
      actor = admin
      assert.equal((await pedir(`/${ajeno.id}/documentos/${doc.id}/reactivacion`, {})).status, 404)
      assert.equal((await pedir(ruta + '/reactivacion', { idUsuario: superadmin.id })).status, 400)
      const eventosAntes = await db.historialSiniestro.count()
      for (const codigo of [404, 503]) {
        errorR2 = codigo
        assert.equal((await pedir(ruta + '/reactivacion', {})).status, codigo === 404 ? 409 : 503)
        assert.equal(
          (await db.documentoSiniestro.findUniqueOrThrow({ where: { id: doc.id } })).eliminado,
          true,
        )
        assert.equal(await db.historialSiniestro.count(), eventosAntes)
      }
      errorR2 = 0
      for (const datos of [
        { idEstadoSiniestro: cerrado.id },
        { idEstadoSiniestro: abierto.id, eliminado: true, fechaBaja: ahora },
        { eliminado: false, fechaBaja: null, eliminacionEnCurso: true },
      ]) {
        await db.siniestro.update({ where: { id: caso.id }, data: datos })
        assert.equal(
          (await pedir(ruta + '/reactivacion', {})).status,
          datos.eliminacionEnCurso ? 403 : 409,
        )
      }
      await db.siniestro.update({ where: { id: caso.id }, data: { eliminacionEnCurso: false } })
      despuesHead = async () => {
        await db.usuario.update({ where: { id: admin.id }, data: { tipoUsuario: 'GESTOR' } })
      }
      assert.equal(
        (await pedir(ruta + '/reactivacion', {})).status,
        403,
        'vuelve a verificar el rol después de R2',
      )
      await db.usuario.update({ where: { id: admin.id }, data: { tipoUsuario: 'ADMINISTRADOR' } })
      despuesHead = async () => {}
      const roto = crearServicioReactivacionDocumento(
        {
          ...deps,
          transaccion: (trabajo) =>
            transaccion((tx) =>
              trabajo(
                new Proxy(tx, {
                  get: (obj, prop) =>
                    prop === 'historialSiniestro'
                      ? {
                          create: async () => {
                            throw Error('Historial fallido')
                          },
                        }
                      : obj[prop],
                }),
              ),
            ),
        },
        () => ahora,
      )
      await assert.rejects(roto.reactivar(admin, caso.id, doc.id), /Historial fallido/)
      assert.equal(
        (await db.documentoSiniestro.findUniqueOrThrow({ where: { id: doc.id } })).eliminado,
        true,
        'el historial y la reactivación son atómicos',
      )
      const respuestas = await Promise.all([
        pedir(ruta + '/reactivacion', {}),
        pedir(ruta + '/reactivacion', {}),
      ])
      assert.deepEqual(respuestas.map((r) => r.status).sort(), [204, 409])
      const actual = await db.documentoSiniestro.findUniqueOrThrow({ where: { id: doc.id } })
      assert.equal(actual.eliminado, false)
      assert.equal(actual.fechaBaja, null)
      assert.equal(actual.motivoBaja, null)
      assert.equal(actual.idUsuarioBaja, null)
      for (const campo of ['fechaCarga', 'idUsuario', 'urlArchivoSinDominio', 'tamanoBytes'])
        assert.deepEqual(actual[campo], doc[campo])
      assert.equal(
        (
          await db.siniestro.findUniqueOrThrow({ where: { id: caso.id } })
        ).fechaUltimoMovimiento.toISOString(),
        ahora.toISOString(),
      )
      assert.equal((await (await pedir(`/${caso.id}/documentos`)).json()).length, 1)
      assert.equal(await db.historialSiniestro.count(), eventosAntes + 1)
      const historia = await db.historialSiniestro.findMany({
        where: { idSiniestro: caso.id },
        orderBy: { id: 'desc' },
      })
      assert.match(historia[0].descripcion, /reactivó el documento "Acta.pdf"/)
      assert.match(historia[1].descripcion, /Documento retirado por error/)
      assert.equal(historia[0].idUsuario, admin.id)
      assert.equal(historia[0].fechaEvento.toISOString(), ahora.toISOString())
      assert.equal(await db.actividadSiniestro.count({ where: { idHistorial: historia[0].id } }), 1)
      await assert.rejects(
        baja.darDeBaja(gestor, caso.id, doc.id, { motivo: 'No se renueva el plazo' }),
        { status: 403 },
      )
      await baja.darDeBaja(admin, caso.id, doc.id, { motivo: 'Segunda baja' })
      actor = superadmin
      assert.equal((await pedir(ruta + '/reactivacion', {})).status, 204)
    } finally {
      if (server) {
        server.closeAllConnections()
        await new Promise((ok) => server.close(ok))
      }
      await disconnectPrisma()
      process.env.DATABASE_URL = original
      if (creada) await control.query(`DROP DATABASE "${nombre}" WITH (FORCE)`)
      await control.end()
    }
  },
)
