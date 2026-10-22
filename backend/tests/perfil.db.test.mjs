import assert from 'node:assert/strict'
import test from 'node:test'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { hashPassword, verifyPassword } from '../src/lib/password.ts'
import { crearServicioSesiones, hashToken } from '../src/modules/auth/sesiones.service.ts'
import { crearServicioPerfil } from '../src/modules/perfil/perfil.service.ts'
import { perfilDatosSchema } from '@cova/shared/schemas/perfil'

const status = (numero) => (error) => error.status === numero
test('PostgreSQL: perfil propio, casos, contraseña en cada escritura, sesiones, límites compartidos y cambio de contraseña; rollback total', async () => {
  const prisma = getPrisma()
  const marca = `perfil-${Date.now()}`
  const rollback = new Error('Revertir prueba de perfil')
  let tiempo = Date.now()
  const inicial = await hashPassword('Inicial.2026')
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const base = {
            usuario: tx.usuario,
            pais: tx.pais,
            provincia: tx.provincia,
            transaccion: (trabajo) => trabajo(tx),
          }
          const correos = []
          const enviarAvisoCambio = async (email) => {
            correos.push(email)
          }
          const sesiones = crearServicioSesiones({
            prisma: tx,
            duracionMs: 3_600_000,
            ahora: () => new Date(tiempo),
          })
          const servicio = crearServicioPerfil({ base, enviarAvisoCambio, ahora: () => tiempo })
          const pais = await tx.pais.create({ data: { nombre: marca } })
          const provincia = await tx.provincia.create({ data: { nombre: marca, idPais: pais.id } })
          const usuario = (sufijo, tipoUsuario = 'GESTOR') =>
            tx.usuario.create({
              data: {
                nombres: 'Ana',
                apellidos: 'Prueba',
                documento: '123',
                telefono: '456',
                email: `${sufijo}-${marca}@example.test`,
                tipoUsuario,
                contrasena: inicial,
                direccion: { create: { idProvincia: provincia.id } },
              },
            })
          const propio = await usuario('propio')
          const otro = await usuario('otro', 'SUPER_ADMINISTRADOR')
          const token = `${marca}-sesion-1`
          const segunda = `${marca}-sesion-2`
          const tokenOtro = `${marca}-sesion-otro`
          const sesion = (idUsuario, t) =>
            tx.sesion.create({
              data: {
                idUsuario,
                tokenHash: hashToken(t),
                fechaVencimiento: new Date(tiempo + 3_600_000),
              },
            })
          await sesion(propio.id, token)
          await sesion(propio.id, segunda)
          await sesion(otro.id, tokenOtro)
          const personales = perfilDatosSchema.parse({
            nombres: 'Ana María',
            apellidos: 'Prueba',
            documento: '123',
            telefono: '789',
            email: propio.email,
            direccion: { idProvincia: provincia.id, localidad: 'Rosario' },
          })
          const datos = { ...personales, contrasenaActual: 'Inicial.2026' }
          await assert.rejects(
            servicio.modificar(propio.id, token, { ...datos, contrasenaActual: 'Incorrecta' }),
            status(400),
          )
          await assert.rejects(
            servicio.verificar(otro.id, token, { contrasena: 'Inicial.2026' }),
            status(401),
          )
          await servicio.verificar(propio.id, token, { contrasena: 'Inicial.2026' })
          // Verificar no autoriza una escritura con contraseña incorrecta.
          await assert.rejects(
            servicio.modificar(propio.id, token, { ...datos, contrasenaActual: 'Incorrecta' }),
            status(400),
          )
          // Otro proceso puede guardar sin compartir un permiso del primero.
          const segundoProceso = crearServicioPerfil({
            base,
            enviarAvisoCambio,
            ahora: () => tiempo,
          })
          await segundoProceso.modificar(propio.id, token, datos)
          // Tampoco hay una vigencia adicional de diez minutos: solo cuenta la sesión vigente.
          tiempo += 600_001
          await servicio.modificar(propio.id, segunda, datos)
          assert.equal(
            (await tx.usuario.findUnique({ where: { id: propio.id } })).contrasena,
            inicial,
          )
          assert.equal((await tx.usuario.findUnique({ where: { id: otro.id } })).telefono, '456')
          assert.equal(
            (await tx.usuario.findUnique({ where: { id: propio.id } })).tipoUsuario,
            'GESTOR',
          )
          // La dirección compartida se copia; no se pisan datos de otro registro.
          await tx.usuario.update({
            where: { id: otro.id },
            data: { idDireccion: propio.idDireccion },
          })
          await servicio.modificar(propio.id, token, {
            ...datos,
            direccion: { ...datos.direccion, localidad: 'Santa Fe' },
          })
          assert.equal(
            (await tx.direccion.findUnique({ where: { id: propio.idDireccion } })).localidad,
            'Rosario',
          )
          // Demorados: >72 h, sin contar cerrados, eliminados ni los de otro usuario; fallback a asignación.
          const aseguradora = await tx.aseguradora.create({ data: { nombre: marca } })
          const abierto = await tx.estadoSiniestro.create({
            data: { nombre: `${marca}-abierto`, descripcion: '-' },
          })
          const cerrado = await tx.estadoSiniestro.create({
            data: { nombre: `${marca}-cerrado`, descripcion: '-', esCierre: true },
          })
          const caso = (horas, extra = {}) =>
            tx.siniestro.create({
              data: {
                numeroSiniestro: marca,
                numeroPoliza: marca,
                fechaAsignacion: new Date(tiempo - 120 * 3_600_000),
                fechaUltimoMovimiento: horas === null ? null : new Date(tiempo - horas * 3_600_000),
                demorado: false,
                menorEdadInvolucrado: false,
                idUsuario: propio.id,
                idAseguradora: aseguradora.id,
                idEstadoSiniestro: abierto.id,
                ...extra,
              },
            })
          await caso(24)
          await caso(96)
          await caso(null)
          await caso(72)
          await caso(200, { idEstadoSiniestro: cerrado.id })
          await caso(200, { eliminado: true, fechaBaja: new Date(tiempo) })
          await caso(300, { idUsuario: otro.id })
          const perfil = await servicio.obtener(propio.id)
          assert.equal(perfil.casosActivos, 4)
          assert.equal(perfil.casosDemorados, 2)
          assert.equal(perfil.demorados.length, 2)
          assert.equal(Object.hasOwn(perfil, 'contrasena'), false)
          // Si la contraseña cambia después de confirmar, la antigua ya no sirve.
          await servicio.verificar(propio.id, token, { contrasena: 'Inicial.2026' })
          await tx.usuario.update({
            where: { id: propio.id },
            data: { contrasena: await hashPassword('Temporal.2026') },
          })
          await assert.rejects(servicio.modificar(propio.id, token, datos), status(400))
          await tx.usuario.update({ where: { id: propio.id }, data: { contrasena: inicial } })
          // Las mismas comprobaciones de provincia y email se usan desde ambos servicios.
          await tx.provincia.update({
            where: { id: provincia.id },
            data: { eliminado: true, fechaBaja: new Date(tiempo) },
          })
          await servicio.modificar(propio.id, token, datos)
          const inactiva = await tx.provincia.create({
            data: {
              nombre: `${marca}-inactiva`,
              idPais: pais.id,
              eliminado: true,
              fechaBaja: new Date(tiempo),
            },
          })
          await assert.rejects(
            servicio.modificar(propio.id, token, {
              ...datos,
              direccion: { ...datos.direccion, idProvincia: inactiva.id },
            }),
            status(409),
          )
          await assert.rejects(
            servicio.modificar(propio.id, token, { ...datos, email: otro.email }),
            status(409),
          )
          await servicio.modificar(propio.id, token, {
            ...datos,
            email: `nuevo-${marca}@example.test`,
          })
          assert.equal(await tx.sesion.count({ where: { tokenHash: hashToken(token) } }), 1)
          assert.equal(await tx.sesion.count({ where: { tokenHash: hashToken(segunda) } }), 0)
          await sesion(propio.id, segunda)
          await tx.recuperacionContrasena.create({
            data: {
              idUsuario: propio.id,
              tokenHash: marca,
              fechaVencimiento: new Date(tiempo + 60_000),
            },
          })
          const cambio = {
            contrasenaActual: 'Inicial.2026',
            contrasena: 'Nueva.2026',
            confirmarContrasena: 'Nueva.2026',
          }
          await assert.rejects(
            servicio.cambiarContrasena(propio.id, token, {
              ...cambio,
              contrasenaActual: 'Incorrecta',
            }),
            status(400),
          )
          assert.deepEqual(correos, [], 'no hay aviso por un intento rechazado')
          assert.equal(await tx.sesion.count({ where: { idUsuario: propio.id } }), 2)
          assert.deepEqual(await servicio.cambiarContrasena(propio.id, token, cambio), {
            correoEnviado: true,
          })
          assert.deepEqual(correos, [`nuevo-${marca}@example.test`])
          assert.equal(await sesiones.validar(token), null)
          assert.equal(await sesiones.validar(segunda), null)
          assert.ok(await sesiones.validar(tokenOtro))
          assert.equal(
            await verifyPassword(
              (await tx.usuario.findUnique({ where: { id: propio.id } })).contrasena,
              'Inicial.2026',
            ),
            false,
          )
          assert.equal(
            await verifyPassword(
              (await tx.usuario.findUnique({ where: { id: propio.id } })).contrasena,
              'Nueva.2026',
            ),
            true,
          )
          assert.equal(await tx.sesion.count({ where: { idUsuario: propio.id } }), 0)
          assert.equal(await tx.sesion.count({ where: { idUsuario: otro.id } }), 1)
          assert.equal(
            await tx.recuperacionContrasena.count({ where: { idUsuario: propio.id } }),
            0,
          )
          await assert.rejects(servicio.modificar(propio.id, token, datos), status(401))
          await assert.rejects(
            servicio.verificar(propio.id, segunda, { contrasena: 'Nueva.2026' }),
            status(401),
          )
          await assert.rejects(
            servicio.modificar(propio.id, token, { ...datos, contrasenaActual: 'Nueva.2026' }),
            status(401),
          )
          // Un fallo del proveedor no conserva sesiones ni informa que el cambio falló.
          const sinCorreo = await usuario('sin-correo', 'ADMINISTRADOR')
          await sesion(sinCorreo.id, `${marca}-fallo-1`)
          await sesion(sinCorreo.id, `${marca}-fallo-2`)
          const errores = []
          const errorOriginal = console.error
          console.error = (...args) => {
            errores.push(args.join(' '))
          }
          try {
            const fallaCorreo = crearServicioPerfil({
              base,
              ahora: () => tiempo,
              enviarAvisoCambio: async () => {
                throw new Error('datos privados del proveedor')
              },
            })
            assert.deepEqual(
              await fallaCorreo.cambiarContrasena(sinCorreo.id, `${marca}-fallo-1`, cambio),
              { correoEnviado: false },
            )
          } finally {
            console.error = errorOriginal
          }
          assert.equal(await tx.sesion.count({ where: { idUsuario: sinCorreo.id } }), 0)
          assert.equal(
            await verifyPassword(
              (await tx.usuario.findUnique({ where: { id: sinCorreo.id } })).contrasena,
              'Nueva.2026',
            ),
            true,
          )
          assert.deepEqual(errores, ['No se pudo enviar el aviso de cambio de contraseña.'])
          // El límite de cinco fallos se comparte entre verificar y los dos PATCH.
          const limitado = crearServicioPerfil({ base, enviarAvisoCambio, ahora: () => tiempo })
          const otros = { ...datos, email: otro.email, contrasenaActual: 'Incorrecta' }
          const fallos = [
            () => limitado.verificar(otro.id, tokenOtro, { contrasena: 'Incorrecta' }),
            () => limitado.modificar(otro.id, tokenOtro, otros),
            () =>
              limitado.cambiarContrasena(otro.id, tokenOtro, {
                ...cambio,
                contrasenaActual: 'Incorrecta',
              }),
            () => limitado.modificar(otro.id, tokenOtro, otros),
            () => limitado.verificar(otro.id, tokenOtro, { contrasena: 'Incorrecta' }),
          ]
          for (const [i, fallo] of fallos.entries())
            await assert.rejects(fallo(), status(i === 4 ? 429 : 400))
          await assert.rejects(
            limitado.verificar(otro.id, tokenOtro, { contrasena: 'Inicial.2026' }),
            status(429),
          )
          await assert.rejects(
            limitado.modificar(otro.id, tokenOtro, { ...otros, contrasenaActual: 'Inicial.2026' }),
            status(429),
          )
          tiempo += 600_001
          await limitado.verificar(otro.id, tokenOtro, { contrasena: 'Inicial.2026' })
          await tx.usuario.update({
            where: { id: propio.id },
            data: { eliminado: true, fechaBaja: new Date(tiempo) },
          })
          await assert.rejects(servicio.obtener(propio.id), status(401))
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
