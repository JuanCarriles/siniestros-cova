import assert from 'node:assert/strict'
import test from 'node:test'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioUsuarios } from '../src/modules/usuarios/usuarios.service.ts'
import { usuarioAltaSchema, usuarioModificacionSchema } from '@cova/shared/schemas/usuarios-abm'
import { hashPassword, verifyPassword } from '../src/lib/password.ts'

const errorStatus = (status) => (error) => error.status === status

test('PostgreSQL: CU-04, jerarquía, contraseñas, casos, baja y sesiones; todos los datos se revierten', async () => {
  const prisma = getPrisma()
  const marca = `usuarios-${Date.now()}`
  const rollback = new Error('Revertir toda la prueba')
  const hashInicial = await hashPassword('Inicial.2026')
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const servicio = crearServicioUsuarios({
            usuario: tx.usuario,
            pais: tx.pais,
            provincia: tx.provincia,
            transaccion: (trabajo) => trabajo(tx),
          })
          const pais = await tx.pais.create({ data: { nombre: marca } })
          const provincia = await tx.provincia.create({ data: { nombre: marca, idPais: pais.id } })
          const actor = (tipoUsuario, sufijo) =>
            tx.usuario.create({
              data: {
                nombres: 'Actor',
                apellidos: 'Prueba',
                documento: '0',
                telefono: '0',
                email: `${sufijo}-${marca}@example.test`,
                contrasena: hashInicial,
                tipoUsuario,
                direccion: { create: {} },
              },
            })
          const superadmin = await actor('SUPER_ADMINISTRADOR', 'super')
          const admin = await actor('ADMINISTRADOR', 'admin')
          const datos = usuarioAltaSchema.parse({
            nombres: 'Ana',
            apellidos: 'Prueba',
            documento: '123',
            telefono: '11 1234',
            email: `alta-${marca}@example.test`,
            tipoUsuario: 'GESTOR',
            contrasena: 'Nueva.2026',
            direccion: {
              idProvincia: String(provincia.id),
              localidad: 'Rosario',
              calle: '',
              pisoDepartamento: '',
              codigoPostal: '',
            },
          })
          const creado = await servicio.crear(admin, datos)
          assert.equal(creado.casosActivos, 0)
          assert.equal(creado.direccion.provincia.pais.id, pais.id)
          assert.equal(Object.hasOwn(creado, 'contrasena'), false)
          const fila = () => tx.usuario.findUnique({ where: { id: creado.id } })
          const original = await fila()
          assert.equal(await verifyPassword(original.contrasena, datos.contrasena), true)
          assert.notEqual(original.contrasena, datos.contrasena)
          await assert.rejects(
            servicio.crear(admin, { ...datos, email: datos.email.toUpperCase() }),
            errorStatus(409),
          )
          await assert.rejects(
            servicio.crear(admin, { ...datos, tipoUsuario: 'ADMINISTRADOR' }),
            errorStatus(403),
          )
          await assert.rejects(
            servicio.crear(superadmin, { ...datos, tipoUsuario: 'SUPER_ADMINISTRADOR' }),
            errorStatus(403),
          )
          await assert.rejects(
            servicio.crear(admin, {
              ...datos,
              email: `bad-${marca}@example.test`,
              direccion: { ...datos.direccion, idProvincia: 2147483647 },
            }),
            errorStatus(409),
          )
          await assert.rejects(
            servicio.modificar(admin, superadmin.id, { nombres: 'No' }),
            errorStatus(403),
          )
          await assert.rejects(
            servicio.modificar(admin, admin.id, { nombres: 'No' }),
            errorStatus(403),
          )
          await assert.rejects(
            servicio.modificar(admin, creado.id, { tipoUsuario: 'ADMINISTRADOR' }),
            errorStatus(403),
          )
          await assert.rejects(servicio.darDeBaja(superadmin, superadmin.id), errorStatus(403))
          await assert.rejects(servicio.darDeBaja(admin, 2147483647), errorStatus(404))
          const otroAdmin = await servicio.crear(superadmin, {
            ...datos,
            email: `otro-admin-${marca}@example.test`,
            tipoUsuario: 'ADMINISTRADOR',
          })
          await assert.rejects(
            servicio.modificar(admin, otroAdmin.id, { telefono: '1' }),
            errorStatus(403),
          )
          await servicio.modificar(superadmin, otroAdmin.id, { telefono: '1' })
          // Contraseña vacía u omitida: el hash permanece exactamente igual.
          await servicio.modificar(
            admin,
            creado.id,
            usuarioModificacionSchema.parse({ telefono: '11 5555', contrasena: '' }),
          )
          assert.equal((await fila()).contrasena, original.contrasena)
          await servicio.modificar(admin, creado.id, { nombres: 'Ana María' })
          assert.equal((await fila()).contrasena, original.contrasena)
          const cantidadDirecciones = await tx.direccion.count()
          await servicio.modificar(admin, creado.id, {
            direccion: { ...datos.direccion, localidad: 'Santa Fe' },
          })
          assert.equal(await tx.direccion.count(), cantidadDirecciones)
          assert.equal((await fila()).idDireccion, original.idDireccion)
          // Dirección compartida: no se modifica la del otro usuario.
          await tx.usuario.update({
            where: { id: otroAdmin.id },
            data: { idDireccion: original.idDireccion },
          })
          await servicio.modificar(admin, creado.id, {
            direccion: { ...datos.direccion, localidad: 'Córdoba' },
          })
          assert.notEqual((await fila()).idDireccion, original.idDireccion)
          assert.equal(
            (await tx.direccion.findUnique({ where: { id: original.idDireccion } })).localidad,
            'Santa Fe',
          )
          const sesion = () =>
            tx.sesion.create({
              data: {
                idUsuario: creado.id,
                tokenHash: `${marca}-sesion`,
                fechaVencimiento: new Date(Date.now() + 60_000),
              },
            })
          const recuperacion = () =>
            tx.recuperacionContrasena.create({
              data: {
                idUsuario: creado.id,
                tokenHash: `${marca}-reset`,
                fechaVencimiento: new Date(Date.now() + 60_000),
              },
            })
          await sesion()
          await recuperacion()
          await servicio.modificar(admin, creado.id, { contrasena: 'Cambiada.2026' })
          assert.equal(await verifyPassword((await fila()).contrasena, 'Cambiada.2026'), true)
          assert.equal(await tx.sesion.count({ where: { idUsuario: creado.id } }), 0)
          assert.equal(
            await tx.recuperacionContrasena.count({ where: { idUsuario: creado.id } }),
            0,
          )
          // Cuenta solo siniestros sin baja y en estados no finales.
          const aseguradora = await tx.aseguradora.create({ data: { nombre: marca } })
          const abierto = await tx.estadoSiniestro.create({
            data: { nombre: `${marca}-abierto`, descripcion: '-' },
          })
          const cierre = await tx.estadoSiniestro.create({
            data: { nombre: `${marca}-cerrado`, descripcion: '-', esCierre: true },
          })
          const caso = (idEstadoSiniestro, eliminado = false) =>
            tx.siniestro.create({
              data: {
                numeroSiniestro: marca,
                numeroPoliza: marca,
                fechaAsignacion: new Date(),
                demorado: false,
                menorEdadInvolucrado: false,
                idUsuario: creado.id,
                idAseguradora: aseguradora.id,
                idEstadoSiniestro,
                eliminado,
                fechaBaja: eliminado ? new Date() : null,
              },
            })
          const activo = await caso(abierto.id)
          await caso(cierre.id)
          await caso(abierto.id, true)
          assert.equal(
            (await servicio.listar(false)).find((u) => u.id === creado.id).casosActivos,
            1,
          )
          await assert.rejects(
            servicio.darDeBaja(admin, creado.id),
            (error) => error.status === 409 && error.details.casosActivos === 1,
          )
          assert.equal((await fila()).eliminado, false)
          await servicio.modificar(superadmin, creado.id, { tipoUsuario: 'ADMINISTRADOR' })
          await servicio.modificar(superadmin, creado.id, { tipoUsuario: 'GESTOR' })
          await tx.siniestro.update({
            where: { id: activo.id },
            data: { idEstadoSiniestro: cierre.id },
          })
          await sesion()
          await recuperacion()
          await servicio.darDeBaja(admin, creado.id)
          assert.equal((await fila()).eliminado, true)
          assert.ok((await fila()).fechaBaja instanceof Date)
          assert.equal(await tx.sesion.count({ where: { idUsuario: creado.id } }), 0)
          assert.equal(
            await tx.recuperacionContrasena.count({ where: { idUsuario: creado.id } }),
            0,
          )
          assert.equal(await tx.siniestro.count({ where: { idUsuario: creado.id } }), 3)
          assert.equal(
            (await servicio.listar(false)).some((u) => u.id === creado.id),
            false,
          )
          assert.equal(
            (await servicio.listar(true)).some((u) => u.id === creado.id),
            true,
          )
          await assert.rejects(
            servicio.modificar(admin, creado.id, { nombres: 'No' }),
            errorStatus(409),
          )
          await assert.rejects(servicio.crear(admin, datos), errorStatus(409))
          await servicio.reactivar(admin, creado.id)
          assert.equal((await fila()).eliminado, false)
          assert.equal((await fila()).fechaBaja, null)
          assert.equal(await verifyPassword((await fila()).contrasena, 'Cambiada.2026'), true)
          assert.equal(JSON.stringify(await servicio.listar(true)).includes('"contrasena"'), false)
          throw rollback
        },
        { timeout: 30_000, isolationLevel: 'Serializable' },
      ),
      (error) => error === rollback,
    )
    assert.equal(await prisma.usuario.count({ where: { email: { contains: marca } } }), 0)
  } finally {
    await disconnectPrisma()
  }
})
