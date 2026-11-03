import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioEdicionCaso } from '../src/modules/siniestros/siniestros-edicion.service.ts'
import { crearServicioHistorialFicha } from '../src/modules/historial/historial-ficha.service.ts'

test(
  'edición por rol en PostgreSQL: datos protegidos, duplicados, historial, direcciones y separación de reasignación',
  { timeout: 90_000 },
  async () => {
    const original = process.env.DATABASE_URL
    assert.ok(original)
    const conexion = new URL(original)
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(conexion.hostname))
    const baseTemporal = `cova_test_edicion_${Date.now()}_${process.pid}`
    assert.match(baseTemporal, /^cova_test_edicion_\d+_\d+$/)
    const adminPg = new pg.Client({ connectionString: original })
    await adminPg.connect()
    let creada = false
    try {
      await adminPg.query(`CREATE DATABASE "${baseTemporal}"`)
      creada = true
      conexion.pathname = `/${baseTemporal}`
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
      const prisma = getPrisma()
      const ahora = new Date('2026-11-02T18:00:00Z')
      const antes = new Date('2026-10-01T12:00:00Z')
      const deps = {
        transaccion: (trabajo) => prisma.$transaction(trabajo, { timeout: 15_000 }),
      }
      const servicio = crearServicioEdicionCaso(deps, () => ahora)
      const usuario = (nombres, tipoUsuario) =>
        prisma.usuario.create({
          data: {
            nombres,
            apellidos: 'Prueba',
            tipoUsuario,
            email: `${nombres}@example.invalid`,
            documento: '0',
            telefono: '0',
            contrasena: '-',
            direccion: { create: {} },
          },
        })
      const admin = await usuario('Admin', 'ADMINISTRADOR'),
        superadmin = await usuario('Super', 'SUPER_ADMINISTRADOR'),
        gestor = await usuario('Gestor', 'GESTOR'),
        otro = await usuario('Otro', 'GESTOR')
      const estado = await prisma.estadoSiniestro.create({
        data: { nombre: 'En tratamiento', descripcion: 'Activo' },
      })
      const aseguradora = await prisma.aseguradora.create({ data: { nombre: 'Aseguradora A' } }),
        segunda = await prisma.aseguradora.create({ data: { nombre: 'Aseguradora B' } })
      const pais = await prisma.pais.create({ data: { nombre: 'Argentina' } })
      const provincia = await prisma.provincia.create({
        data: { nombre: 'Santa Fe', idPais: pais.id },
      })
      const ajustador = await prisma.ajustador.create({
        data: {
          nombres: 'José',
          apellidos: 'Pérez',
          email: 'j@example.invalid',
          telefono: '0',
          idAseguradora: aseguradora.id,
        },
      })
      const ajeno = await prisma.ajustador.create({
        data: {
          nombres: 'Ana',
          apellidos: 'Pérez',
          email: 'a@example.invalid',
          telefono: '0',
          idAseguradora: segunda.id,
        },
      })
      const lugarCompartido = await prisma.direccion.create({
        data: {
          idProvincia: provincia.id,
          localidad: 'Rosario',
          calle: 'Calle inicial',
          pisoDepartamento: '2 A',
        },
      })
      await prisma.usuario.update({
        where: { id: otro.id },
        data: { idDireccion: lugarCompartido.id },
      })
      let numero = 0
      const caso = (extra = {}) =>
        prisma.siniestro.create({
          data: {
            numeroSiniestro: `CASO-${++numero}`,
            numeroPoliza: 'POL-1',
            sucursal: 'Central',
            idAseguradora: aseguradora.id,
            idUsuario: gestor.id,
            idEstadoSiniestro: estado.id,
            fechaAsignacion: antes,
            menorEdadInvolucrado: false,
            demorado: true,
            fechaUltimoMovimiento: antes,
            ...extra,
          },
        })
      const s = await caso({
        idDireccion: lugarCompartido.id,
        idAjustador: ajustador.id,
        sucursal: null,
      })
      const pedido = (edicion, administra = true) => ({
        version: edicion.version,
        hecho: edicion.datos.hecho,
        lugar: edicion.datos.lugar,
        ...(administra
          ? {
              poliza: {
                ...edicion.datos.poliza,
                sucursal: edicion.datos.poliza.sucursal || 'Central',
              },
              asignacion: edicion.datos.asignacion,
            }
          : {}),
      })
      const originalCaso = await prisma.siniestro.findUniqueOrThrow({ where: { id: s.id } })
      const edicionGestor = await servicio.obtener(gestor, s.id)
      assert.equal(edicionGestor.puedeEditarAsignacion, false)
      assert.equal('usuarios' in edicionGestor.opciones, false)
      await assert.rejects(servicio.obtener(otro, s.id), { status: 403 })
      await assert.rejects(servicio.modificar(otro, s.id, pedido(edicionGestor, false)), {
        status: 403,
      })
      for (const extra of [
        { poliza: edicionGestor.datos.poliza },
        { asignacion: edicionGestor.datos.asignacion },
      ])
        await assert.rejects(
          servicio.modificar({ ...gestor, tipoUsuario: 'SUPER_ADMINISTRADOR' }, s.id, {
            ...pedido(edicionGestor, false),
            ...extra,
          }),
          { status: 403 },
        )
      await assert.rejects(
        servicio.modificar(gestor, s.id, { ...pedido(edicionGestor, false), idUsuario: admin.id }),
      )
      const sinCambios = await servicio.modificar(gestor, s.id, pedido(edicionGestor, false))
      assert.equal(sinCambios.modificado, false)
      assert.equal(await prisma.historialSiniestro.count(), 0)
      const cambioGestor = pedido(edicionGestor, false)
      cambioGestor.hecho = {
        ...cambioGestor.hecho,
        causa: 'Nueva descripción del hecho',
        fechaOcurrencia: '2026-10-30',
        horaOcurrencia: '18:40:25',
        menorEdadInvolucrado: true,
      }
      cambioGestor.lugar = { ...cambioGestor.lugar, calle: 'Nueva dirección' }
      await servicio.modificar(gestor, s.id, cambioGestor)
      const actualizado = await prisma.siniestro.findUniqueOrThrow({
        where: { id: s.id },
        include: { direccion: true },
      })
      for (const campo of [
        'numeroSiniestro',
        'numeroPoliza',
        'sucursal',
        'idUsuario',
        'idAseguradora',
        'idAjustador',
      ])
        assert.equal(actualizado[campo], originalCaso[campo])
      assert.equal(actualizado.causa, cambioGestor.hecho.causa)
      assert.equal(actualizado.horaOcurrencia.toISOString().slice(11, 19), '18:40:25')
      assert.equal(actualizado.fechaUltimoMovimiento.toISOString(), ahora.toISOString())
      assert.equal(actualizado.demorado, false)
      assert.notEqual(actualizado.idDireccion, lugarCompartido.id)
      assert.equal(actualizado.direccion.pisoDepartamento, '2 A')
      assert.equal(
        (await prisma.direccion.findUniqueOrThrow({ where: { id: lugarCompartido.id } })).calle,
        'Calle inicial',
      )
      const historial = await crearServicioHistorialFicha(prisma).listar(gestor, s.id)
      assert.equal(historial.length, 1)
      assert.equal(historial[0].tipo, 'MODIFICACION_DATOS')
      assert.equal(historial[0].usuario.nombre, 'Gestor Prueba')
      assert.equal(historial[0].fecha, ahora.toISOString())
      assert.ok(
        historial[0].descripcion.includes('Causa') &&
          historial[0].descripcion.includes('Nueva dirección'),
      )
      await assert.rejects(servicio.modificar(gestor, s.id, cambioGestor), { status: 409 })
      const edicionAdmin = await servicio.obtener(admin, s.id)
      assert.equal(edicionAdmin.puedeEditarAsignacion, true)
      assert.equal('usuarios' in edicionAdmin.opciones, false)
      const repetido = await caso({
        numeroSiniestro: 'RePeTiDo',
        eliminado: true,
        fechaBaja: ahora,
      })
      const duplicado = pedido(edicionAdmin)
      duplicado.poliza = {
        ...duplicado.poliza,
        numeroSiniestro: repetido.numeroSiniestro.toLowerCase(),
      }
      await assert.rejects(
        servicio.modificar(admin, s.id, duplicado),
        (e) => e.status === 409 && e.details?.campo === 'poliza.numeroSiniestro',
      )
      const invalido = pedido(edicionAdmin)
      invalido.asignacion = { ...invalido.asignacion, idAjustador: ajeno.id }
      await assert.rejects(servicio.modificar(admin, s.id, invalido), { status: 409 })
      const adminCambio = pedido(edicionAdmin)
      adminCambio.poliza = {
        ...adminCambio.poliza,
        numeroSiniestro: 'ACTUALIZADO',
        numeroPoliza: 'POL-2',
        sucursal: 'Rosario',
      }
      await assert.rejects(servicio.modificar(admin, s.id, { ...adminCambio, asignacion: { ...adminCambio.asignacion, idUsuario: otro.id } }), { name: 'ZodError' })
      await servicio.modificar(superadmin, s.id, adminCambio)
      const editado = await prisma.siniestro.findUniqueOrThrow({ where: { id: s.id } })
      assert.equal(editado.numeroSiniestro, 'ACTUALIZADO')
      assert.equal(editado.numeroPoliza, 'POL-2')
      assert.equal(editado.idUsuario, gestor.id)
      assert.equal(await prisma.notificacion.count({ where: { idSiniestro: s.id } }), 0)
      const eventos = await prisma.historialSiniestro.findMany({ where: { idSiniestro: s.id }, orderBy: { id: 'asc' } })
      assert.equal(eventos.length, 2)
      assert.equal(eventos[0].id, historial[0].id)
      assert.equal(eventos[1].tipoEvento, 'MODIFICACION_DATOS')
      assert.equal(eventos[1].idUsuario, superadmin.id)
      // Un fallo de historial revierte todos los datos y no manda mails.
      const falla = crearServicioEdicionCaso(
        {
          ...deps,
          transaccion: (trabajo) =>
            prisma.$transaction((tx) =>
              trabajo(
                new Proxy(tx, {
                  get(obj, clave) {
                    return clave === 'historialSiniestro'
                      ? {
                          create: async () => {
                            throw new Error('Fallo simulado')
                          },
                        }
                      : Reflect.get(obj, clave)
                  },
                }),
              ),
            ),
        },
        () => ahora,
      )
      const paraFallar = pedido(await servicio.obtener(admin, s.id))
      paraFallar.poliza = { ...paraFallar.poliza, sucursal: 'No debe guardarse' }
      await assert.rejects(falla.modificar(admin, s.id, paraFallar), /Fallo simulado/)
      assert.equal(
        (await prisma.siniestro.findUniqueOrThrow({ where: { id: s.id } })).sucursal,
        'Rosario',
      )
      // Dos casos distintos que se intentan numerar igual: el índice único resuelve la carrera.
      const c1 = await caso(),
        c2 = await caso()
      const p1 = pedido(await servicio.obtener(admin, c1.id)),
        p2 = pedido(await servicio.obtener(admin, c2.id))
      p1.poliza = { ...p1.poliza, numeroSiniestro: 'NUMERO-COMUN' }
      p2.poliza = { ...p2.poliza, numeroSiniestro: 'numero-comun' }
      const carrera = await Promise.allSettled([
        servicio.modificar(admin, c1.id, p1),
        servicio.modificar(admin, c2.id, p2),
      ])
      assert.equal(carrera.filter((r) => r.status === 'fulfilled').length, 1)
      assert.equal(carrera.find((r) => r.status === 'rejected').reason.status, 409)
      assert.equal(
        await prisma.historialSiniestro.count({ where: { idSiniestro: { in: [c1.id, c2.id] } } }),
        1,
      )
      for (const extra of [{ eliminado: true, fechaBaja: ahora }, { eliminacionEnCurso: true }]) {
        const bloqueado = await caso(extra)
        await assert.rejects(servicio.obtener(admin, bloqueado.id), { status: 409 })
        await assert.rejects(servicio.modificar(admin, bloqueado.id, adminCambio), { status: 409 })
      }
    } finally {
      await disconnectPrisma()
      process.env.DATABASE_URL = original
      if (creada) await adminPg.query(`DROP DATABASE "${baseTemporal}" WITH (FORCE)`)
      await adminPg.end()
    }
  },
)
