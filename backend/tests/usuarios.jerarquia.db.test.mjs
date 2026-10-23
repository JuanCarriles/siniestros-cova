import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { hashPassword } from '../src/lib/password.ts'
import { crearServicioUsuarios } from '../src/modules/usuarios/usuarios.service.ts'
import { crearUsuariosRouter } from '../src/modules/usuarios/usuarios.routes.ts'
import { errorHandler } from '../src/middlewares/errorHandler.ts'

test('HTTP y PostgreSQL: matriz de roles, promoción, rol vigente y rechazos sin escrituras; rollback total', async () => {
  const prisma = getPrisma()
  const marca = `jerarquia-${Date.now()}`
  const rollback = new Error('Revertir prueba de jerarquía')
  const hash = await hashPassword('Inicial.2026')
  let http
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const pais = await tx.pais.create({ data: { nombre: marca } })
          const provincia = await tx.provincia.create({ data: { nombre: marca, idPais: pais.id } })
          const crearActor = (tipoUsuario, nombre) =>
            tx.usuario.create({
              data: {
                nombres: nombre,
                apellidos: 'Prueba',
                documento: '0',
                telefono: '0',
                email: `${nombre}-${marca}@example.test`,
                tipoUsuario,
                contrasena: hash,
                direccion: { create: { idProvincia: provincia.id } },
              },
            })
          const actores = {
            gestor: await crearActor('GESTOR', 'gestor'),
            admin: await crearActor('ADMINISTRADOR', 'admin'),
            super: await crearActor('SUPER_ADMINISTRADOR', 'super'),
          }
          const servicio = crearServicioUsuarios({
            usuario: tx.usuario,
            pais: tx.pais,
            provincia: tx.provincia,
            transaccion: (trabajo) => trabajo(tx),
          })
          const app = express()
          app.use(express.json())
          app.use(
            '/api/usuarios',
            crearUsuariosRouter({
              servicio,
              requerirSesion: (req, res, next) => {
                const actor = actores[req.get('x-actor')]
                if (!actor) return res.status(401).end()
                // Simula el rol que traía la sesión. El servicio debe comprobar el rol vigente en la base.
                req.usuario = {
                  id: actor.id,
                  nombres: actor.nombres,
                  apellidos: actor.apellidos,
                  email: actor.email,
                  tipoUsuario: actor.tipoUsuario,
                }
                next()
              },
            }),
          )
          app.use(errorHandler)
          http = app.listen(0, '127.0.0.1')
          await new Promise((ok) => http.once('listening', ok))
          const pedir = async (actor, ruta = '', method = 'GET', body) => {
            const res = await fetch(`http://127.0.0.1:${http.address().port}/api/usuarios${ruta}`, {
              method,
              headers: {
                'content-type': 'application/json',
                ...(actor ? { 'x-actor': actor } : {}),
              },
              ...(body ? { body: JSON.stringify(body) } : {}),
            })
            return { status: res.status, data: await res.json().catch(() => null) }
          }
          let numero = 0
          const alta = (tipoUsuario) => ({
            nombres: 'Alta',
            apellidos: 'Prueba',
            documento: '123',
            telefono: '11 5555',
            email: `alta-${++numero}-${marca}@example.test`,
            tipoUsuario,
            contrasena: 'Nueva.2026',
            direccion: { idProvincia: provincia.id, localidad: 'Rosario' },
          })
          const comprobar = async (actor, ruta, method, body, status, mensaje) => {
            const r = await pedir(actor, ruta, method, body)
            assert.equal(r.status, status, `${actor}: ${method} ${ruta}: ${JSON.stringify(r.data)}`)
            if (mensaje) assert.match(r.data.error, mensaje)
            return r.data
          }
          const cantidadUsuarios = await tx.usuario.count()
          const cantidadDirecciones = await tx.direccion.count()
          await comprobar(null, '', 'POST', alta('GESTOR'), 401)
          for (const rol of ['GESTOR', 'ADMINISTRADOR', 'SUPER_ADMINISTRADOR'])
            await comprobar('gestor', '', 'POST', alta(rol), 403, /no tiene permiso/)
          await comprobar(
            'admin',
            '',
            'POST',
            alta('ADMINISTRADOR'),
            403,
            /Solo el superadministrador puede crear administradores/,
          )
          await comprobar(
            'admin',
            '',
            'POST',
            alta('SUPER_ADMINISTRADOR'),
            403,
            /No se pueden crear superadministradores/,
          )
          await comprobar(
            'super',
            '',
            'POST',
            alta('SUPER_ADMINISTRADOR'),
            403,
            /No se pueden crear superadministradores/,
          )
          assert.equal(await tx.usuario.count(), cantidadUsuarios, 'los rechazos no crean usuarios')
          assert.equal(
            await tx.direccion.count(),
            cantidadDirecciones,
            'los rechazos no dejan direcciones huérfanas',
          )

          const gestorAdmin = await comprobar('admin', '', 'POST', alta('GESTOR'), 201)
          const gestorSuper = await comprobar('super', '', 'POST', alta('GESTOR'), 201)
          const adminSuper = await comprobar('super', '', 'POST', alta('ADMINISTRADOR'), 201)
          assert.equal(gestorAdmin.tipoUsuario, 'GESTOR')
          assert.equal(gestorSuper.tipoUsuario, 'GESTOR')
          assert.equal(adminSuper.tipoUsuario, 'ADMINISTRADOR')
          assert.equal(Object.hasOwn(adminSuper, 'contrasena'), false)
          await comprobar(
            'admin',
            `/${gestorAdmin.id}`,
            'PATCH',
            { tipoUsuario: 'ADMINISTRADOR' },
            403,
            /Solo el superadministrador puede asignar/,
          )
          await comprobar(
            'admin',
            `/${gestorAdmin.id}`,
            'PATCH',
            { tipoUsuario: 'SUPER_ADMINISTRADOR' },
            403,
            /No se puede asignar/,
          )
          await comprobar(
            'admin',
            `/${adminSuper.id}`,
            'PATCH',
            { telefono: '123' },
            403,
            /solo podés modificar/,
          )
          await comprobar(
            'admin',
            `/${actores.super.id}`,
            'PATCH',
            { nombres: 'No' },
            403,
            /solo podés modificar/,
          )
          await comprobar('admin', `/${actores.admin.id}`, 'PATCH', { nombres: 'No' }, 403)
          for (const accion of ['baja', 'reactivacion'])
            await comprobar('admin', `/${adminSuper.id}/${accion}`, 'PATCH', undefined, 403)
          await comprobar('super', `/${actores.super.id}/baja`, 'PATCH', undefined, 403)
          assert.equal(
            (await tx.usuario.findUnique({ where: { id: gestorAdmin.id } })).tipoUsuario,
            'GESTOR',
          )
          assert.equal(
            (await tx.usuario.findUnique({ where: { id: adminSuper.id } })).eliminado,
            false,
          )

          // Intentar falsificar quién hace la petición tampoco habilita un alta.
          await comprobar(
            'admin',
            '',
            'POST',
            { ...alta('ADMINISTRADOR'), actor: { tipoUsuario: 'SUPER_ADMINISTRADOR' } },
            400,
          )
          const promovido = await comprobar(
            'super',
            `/${gestorSuper.id}`,
            'PATCH',
            { tipoUsuario: 'ADMINISTRADOR' },
            200,
          )
          assert.equal(promovido.tipoUsuario, 'ADMINISTRADOR')

          // Cambio de jerarquía mientras la sesión conserva el rol anterior.
          await tx.usuario.update({
            where: { id: actores.admin.id },
            data: { tipoUsuario: 'GESTOR' },
          })
          await comprobar('admin', '', 'POST', alta('GESTOR'), 403, /gestores no pueden/)
          await tx.usuario.update({
            where: { id: actores.super.id },
            data: { tipoUsuario: 'ADMINISTRADOR' },
          })
          await comprobar(
            'super',
            '',
            'POST',
            alta('ADMINISTRADOR'),
            403,
            /Solo el superadministrador/,
          )
          await tx.usuario.update({
            where: { id: actores.admin.id },
            data: { eliminado: true, fechaBaja: new Date() },
          })
          await comprobar('admin', '', 'POST', alta('GESTOR'), 401, /sesión venció/)
          await new Promise((ok) => http.close(ok))
          http = undefined
          throw rollback
        },
        { timeout: 30_000, isolationLevel: 'Serializable' },
      ),
      (error) => error === rollback,
    )
    assert.equal(await prisma.usuario.count({ where: { email: { contains: marca } } }), 0)
  } finally {
    if (http) await new Promise((ok) => http.close(ok))
    await disconnectPrisma()
  }
})
