import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import sharp from 'sharp'
import express from 'express'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioDocumentosGestion } from '../src/modules/documentos/documentos-gestion.service.ts'
import { crearServicioDocumentosFicha } from '../src/modules/documentos/documentos-ficha.service.ts'
import { crearServicioArchivosDocumento } from '../src/modules/documentos/documentos-archivos.service.ts'
import { crearServicioCrearSiniestro } from '../src/modules/siniestros/siniestros-alta-crear.service.ts'
import { crearServicioBajasSiniestros } from '../src/modules/siniestros/siniestros-bajas.service.ts'
import { crearSiniestrosRouter } from '../src/modules/siniestros/siniestros.routes.ts'
import { crearSiniestroSchema } from '@cova/shared/schemas/siniestros-alta'
import { errorHandler, notFound } from '../src/middlewares/errorHandler.ts'
import { HttpError } from '../src/utils/httpError.ts'

test(
  'imágenes: carga HTTP, R2, permisos, idempotencia, alta y borrado, archivos nuevos y anteriores',
  { timeout: 90000 },
  async () => {
    const original = process.env.DATABASE_URL
    const url = new URL(original)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    const nombre = `cova_test_imagenes_${Date.now()}_${process.pid}`
    const db = new pg.Client({ connectionString: original })
    await db.connect()
    let creada = false,
      server
    try {
      await db.query(`CREATE DATABASE "${nombre}"`)
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
      const prisma = getPrisma()
      const usuario = (n, tipoUsuario) =>
        prisma.usuario.create({
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
        ajeno = await usuario('Ajeno', 'GESTOR'),
        admin = await usuario('Admin', 'ADMINISTRADOR')
      const abierto = await prisma.estadoSiniestro.create({
        data: { nombre: 'Activo', descripcion: 'Abierto' },
      })
      const cierre = await prisma.estadoSiniestro.create({
        data: { nombre: 'Final', descripcion: 'Cerrado', esCierre: true },
      })
      const aseguradora = await prisma.aseguradora.create({ data: { nombre: 'Imágenes' } })
      let numero = 0
      const caso = () =>
        prisma.siniestro.create({
          data: {
            numeroSiniestro: `IMG-${++numero}`,
            numeroPoliza: 'P',
            fechaAsignacion: new Date('2026-10-01T15:00:00Z'),
            menorEdadInvolucrado: false,
            idEstadoSiniestro: abierto.id,
            idAseguradora: aseguradora.id,
            idUsuario: gestor.id,
          },
        })
      const s = await caso(),
        otro = await caso()
      const objetos = new Map(),
        firmas = [],
        heads = []
      let fallarMiniatura = false,
        perderConfirmacion = false
      const r2 = {
        subir: async (archivo, carpeta, metadata) => {
          const extension = archivo.nombreOriginal.split('.').pop().toLowerCase()
          const clave = `${carpeta}/${randomUUID()}.${extension}`
          objetos.set(clave, { contenido: Buffer.from(archivo.contenido), metadata })
          return {
            clave,
            nombreOriginal: archivo.nombreOriginal,
            tipoExtension: extension,
            mimeType: extension === 'pdf' ? 'application/pdf' : 'image/jpeg',
            tamanoBytes: BigInt(archivo.contenido.byteLength),
          }
        },
        subirDerivada: async (clave, contenido, metadata) => {
          objetos.set(clave, { contenido: Buffer.from(contenido), metadata })
          if (fallarMiniatura && clave.includes('miniatura')) throw new HttpError(503, 'R2 caído')
        },
        eliminar: async (clave) => {
          objetos.delete(clave)
        },
        comprobarExistencia: async (clave) => {
          heads.push(clave)
          if (!objetos.has(clave)) throw new HttpError(404, 'No existe')
          return objetos.get(clave).metadata
        },
        firmarDescarga: async (clave, nombre, inline = false) => {
          firmas.push({ clave, nombre, inline })
          return { url: `https://example.invalid/${clave}`, venceEnSegundos: 60 }
        },
        copiar: async (clave, carpeta) => {
          if (!objetos.has(clave)) throw new Error('No existe')
          const destino = carpeta + '/' + clave.split('/').pop()
          objetos.set(destino, objetos.get(clave))
          return destino
        },
      }
      const transaccion = async (trabajo) => {
        const resultado = await prisma.$transaction(trabajo, { timeout: 15000 })
        if (perderConfirmacion && resultado?.reutilizado === false) {
          perderConfirmacion = false
          throw new Error('Confirmación perdida')
        }
        return resultado
      }
      const carga = crearServicioDocumentosGestion({ transaccion, almacenamiento: () => r2 })
      const archivos = crearServicioArchivosDocumento(prisma, () => r2)
      const alta = crearServicioCrearSiniestro({
        transaccion,
        almacenamiento: () => r2,
        enviarAvisoAsignacion: async () => {},
        urlSistema: 'https://cova.example/',
      })
      let actor = gestor
      const app = express()
      app.use(express.json())
      app.use(
        '/api/siniestros',
        crearSiniestrosRouter({
          documentosCarga: carga,
          documentosArchivos: archivos,
          creacion: alta,
          ficha: { documentos: crearServicioDocumentosFicha(prisma) },
          requerirSesion: (req, _res, next) => {
            req.usuario = actor
            next()
          },
        }),
      )
      app.use(notFound, errorHandler)
      server = app.listen(0, '127.0.0.1')
      await once(server, 'listening')
      const base = `http://127.0.0.1:${server.address().port}/api/siniestros`
      const imagen = await sharp({
        create: { width: 2400, height: 1500, channels: 3, background: 'white' },
      })
        .jpeg()
        .toBuffer()
      const enviar = (buffer, nombre, idCarga = randomUUID()) => {
        const form = new FormData()
        form.append('archivo', new Blob([buffer]), nombre)
        return fetch(`${base}/${s.id}/documentos`, {
          method: 'POST',
          headers: { 'X-Id-Carga': idCarga },
          body: form,
        })
      }
      const idCarga = randomUUID()
      const respuesta = await enviar(imagen, 'foto.jpg', idCarga)
      assert.equal(respuesta.status, 201)
      const id = (await respuesta.json()).id
      const doc = await prisma.documentoSiniestro.findUniqueOrThrow({ where: { id } })
      assert.deepEqual(
        [doc.anchoImagen, doc.altoImagen, doc.anchoOriginal, doc.altoOriginal],
        [1600, 1000, 2400, 1500],
      )
      const guardada = objetos.get(doc.urlArchivoSinDominio).contenido
      assert.equal(doc.tamanoBytes, BigInt(guardada.byteLength))
      assert.ok(guardada.length < imagen.length)
      assert.equal(doc.nombreOriginal, 'foto.jpg')
      assert.equal(doc.tipoExtension, 'webp')
      assert.equal(doc.mimeType, 'image/webp')
      assert.equal(doc.claveImagenOptimizada, null)
      assert.equal(objetos.size, 2)
      const mini = await sharp(objetos.get(doc.claveMiniatura).contenido).metadata()
      assert.deepEqual([mini.width, mini.height], [300, 188])
      assert.equal(await prisma.historialSiniestro.count({ where: { idSiniestro: s.id } }), 1)
      assert.ok(
        (await prisma.siniestro.findUniqueOrThrow({ where: { id: s.id } })).fechaUltimoMovimiento,
      )
      assert.equal((await enviar(imagen, 'foto.jpg', idCarga)).status, 200)
      assert.equal(objetos.size, 2)
      const listado = await (await fetch(`${base}/${s.id}/documentos`)).json()
      assert.equal(listado[0].imagen.ancho, 1600)
      assert.ok(!JSON.stringify(listado).includes(doc.claveMiniatura), 'no expone claves de R2')
      for (const tipo of ['miniatura', 'vista', 'original']) {
        const headsAntes = heads.length
        const r = await fetch(`${base}/${s.id}/documentos/${id}/${tipo}`, { redirect: 'manual' })
        assert.equal(r.status, 302)
        assert.equal(r.headers.get('cache-control'), 'private, no-store')
        assert.equal(firmas.at(-1).inline, tipo !== 'original')
        assert.equal(heads.length - headsAntes, tipo === 'miniatura' ? 0 : 1)
        assert.equal(
          firmas.at(-1).clave,
          tipo === 'miniatura' ? doc.claveMiniatura : doc.urlArchivoSinDominio,
        )
        assert.equal(
          firmas.at(-1).nombre,
          tipo === 'miniatura' ? 'foto-miniatura.webp' : 'foto.webp',
        )
      }
      actor = ajeno
      assert.equal(
        (await fetch(`${base}/${s.id}/documentos/${id}/miniatura`, { redirect: 'manual' })).status,
        403,
      )
      actor = gestor
      assert.equal(
        (await fetch(`${base}/${otro.id}/documentos/${id}/original`, { redirect: 'manual' }))
          .status,
        404,
      )
      const pdf = await readFile(new URL('./fixtures/plantillas/valido.pdf', import.meta.url))
      const rp = await enviar(pdf, 'firmado.pdf')
      assert.equal(rp.status, 201)
      const dp = await prisma.documentoSiniestro.findUniqueOrThrow({
        where: { id: (await rp.json()).id },
      })
      assert.equal(dp.claveMiniatura, null)
      assert.deepEqual(objetos.get(dp.urlArchivoSinDominio).contenido, pdf)
      const antes = objetos.size
      fallarMiniatura = true
      assert.equal((await enviar(imagen, 'fallida.jpg')).status, 503)
      fallarMiniatura = false
      assert.equal(objetos.size, antes)
      perderConfirmacion = true
      const idPerdido = randomUUID()
      assert.equal((await enviar(imagen, 'confirmada.jpg', idPerdido)).status, 503)
      assert.equal(objetos.size, antes + 2, 'conserva ambos archivos si el commit se confirmó')
      assert.equal((await enviar(imagen, 'confirmada.jpg', idPerdido)).status, 200)
      assert.equal(objetos.size, antes + 2)
      actor = admin
      const temporal = await alta.subirDocumento(admin, {
        nombreOriginal: 'alta.jpg',
        contenido: imagen,
      })
      assert.equal([...objetos.keys()].filter((k) => k.startsWith(`altas/${admin.id}/`)).length, 2)
      const datos = crearSiniestroSchema.parse({
        datosCaso: {
          numeroSiniestro: 'ALTA-IMG',
          numeroPoliza: 'POL-1',
          inicioVigencia: '',
          idAseguradora: aseguradora.id,
          sucursal: 'Centro',
          idAjustador: '',
          fechaOcurrencia: '',
          horaOcurrencia: '',
          menorEdadInvolucrado: false,
          causa: '',
          lugar: { idProvincia: '', localidad: '', calle: '', codigoPostal: '' },
        },
        vehiculos: [],
        personasExternas: [],
        abogados: [],
        peritos: [],
        documentos: [temporal],
        idUsuarioAsignado: gestor.id,
      })
      datos.documentos[0].tipoExtension = 'jpg'
      datos.documentos[0].mimeType = 'application/pdf'
      datos.documentos[0].tamanoBytes = 1
      const creado = await alta.crear(admin, datos)
      const da = await prisma.documentoSiniestro.findFirstOrThrow({
        where: { idSiniestro: creado.id },
      })
      assert.equal(da.anchoImagen, 1600)
      assert.ok(objetos.has(da.claveMiniatura))
      assert.equal(da.claveImagenOptimizada, null)
      assert.equal(da.tipoExtension, 'webp')
      assert.equal(da.mimeType, 'image/webp')
      assert.equal(da.tamanoBytes, BigInt(objetos.get(da.urlArchivoSinDominio).contenido.length))
      assert.equal([...objetos.keys()].filter((k) => k.startsWith(`altas/${admin.id}/`)).length, 0)
      // También copia altas v1 que ya existían antes de la corrección, sin perder su original ni las vistas.
      const claveAnterior = `altas/${admin.id}/${randomUUID()}.jpg`
      const datosAnteriores = {
        version: 1,
        anchoOriginal: 2400,
        altoOriginal: 1500,
        ancho: 1600,
        alto: 1000,
        tamanoBytes: 400,
      }
      objetos.set(claveAnterior, {
        contenido: imagen,
        metadata: { 'imagen-v1': JSON.stringify(datosAnteriores) },
      })
      objetos.set(claveAnterior + '.vista.webp', { contenido: Buffer.from('vista anterior') })
      objetos.set(claveAnterior + '.miniatura.webp', {
        contenido: Buffer.from('miniatura anterior'),
      })
      const anterior = await alta.crear(admin, {
        ...datos,
        datosCaso: { ...datos.datosCaso, numeroSiniestro: 'ALTA-ANTERIOR' },
        documentos: [
          {
            clave: claveAnterior,
            nombreOriginal: 'anterior.jpg',
            tipoExtension: 'jpg',
            mimeType: 'image/jpeg',
            tamanoBytes: imagen.length,
          },
        ],
      })
      const legado = await prisma.documentoSiniestro.findFirstOrThrow({
        where: { idSiniestro: anterior.id },
      })
      assert.deepEqual(objetos.get(legado.urlArchivoSinDominio).contenido, imagen)
      assert.ok(objetos.has(legado.claveImagenOptimizada))
      assert.ok(objetos.has(legado.claveMiniatura))
      assert.equal([...objetos.keys()].filter((k) => k.startsWith(`altas/${admin.id}/`)).length, 0)
      const descartable = await alta.subirDocumento(admin, {
        nombreOriginal: 'descartar.jpg',
        contenido: imagen,
      })
      await alta.quitarDocumento(admin, descartable.clave)
      assert.equal([...objetos.keys()].filter((k) => k.startsWith(`altas/${admin.id}/`)).length, 0)
      await prisma.siniestro.update({
        where: { id: s.id },
        data: { eliminado: true, fechaBaja: new Date(), idEstadoSiniestro: cierre.id },
      })
      await crearServicioBajasSiniestros({
        base: { transaccion },
        almacenamiento: () => r2,
      }).eliminar(admin, s.id, { numeroSiniestro: s.numeroSiniestro })
      assert.equal([...objetos.keys()].filter((k) => k.startsWith(`siniestros/${s.id}/`)).length, 0)
      assert.ok(objetos.has(da.claveMiniatura), 'no borra las imágenes de otro expediente')
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve))
      await disconnectPrisma()
      if (creada) await db.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`)
      await db.end()
      process.env.DATABASE_URL = original
    }
  },
)
