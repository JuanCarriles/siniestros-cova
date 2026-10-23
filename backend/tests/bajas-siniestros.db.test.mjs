import assert from 'node:assert/strict'
import test from 'node:test'
import { siniestrosActivosAsociadosSchema } from '@cova/shared/schemas/siniestros-asociados'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioUsuarios } from '../src/modules/usuarios/usuarios.service.ts'
import { crearServicioSiniestros } from '../src/modules/siniestros/siniestros.service.ts'
import { crearServicioAjustadores } from '../src/modules/ajustadores/ajustadores.service.ts'
import { hashToken } from '../src/modules/auth/sesiones.service.ts'

const status = (codigo) => (error) => error.status === codigo

test('PostgreSQL: detalle, permisos, paginación y baja solo después de resolver todos los activos; rollback total', async () => {
  const prisma = getPrisma()
  const marca = `bajas-${Date.now()}`
  const rollback = new Error('Revertir prueba de bajas')
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const pais = await tx.pais.create({ data: { nombre: marca } })
          const provincia = await tx.provincia.create({ data: { nombre: marca, idPais: pais.id } })
          const crearUsuario = (nombre, tipoUsuario = 'GESTOR') =>
            tx.usuario.create({
              data: {
                nombres: nombre,
                apellidos: marca,
                documento: '0',
                telefono: '0',
                email: `${nombre}-${marca}@example.test`,
                contrasena: 'fixture-sin-acceso',
                tipoUsuario,
                direccion: { create: { idProvincia: provincia.id } },
              },
            })
          const actor = await crearUsuario('admin', 'ADMINISTRADOR')
          const usuario = await crearUsuario('asignado')
          const otro = await crearUsuario('otro')
          const aseguradora = await tx.aseguradora.create({ data: { nombre: marca } })
          const crearAjustador = (nombre) =>
            tx.ajustador.create({
              data: {
                nombres: nombre,
                apellidos: marca,
                email: `${nombre}-${marca}@example.test`,
                telefono: '0',
                idAseguradora: aseguradora.id,
              },
            })
          const ajustador = await crearAjustador('ajustador')
          const otroAjustador = await crearAjustador('otro-ajustador')
          const abierto = await tx.estadoSiniestro.create({
            data: { nombre: marca, descripcion: 'Abierto', esCierre: false },
          })
          const cerrado = await tx.estadoSiniestro.create({
            data: { nombre: `${marca}-cerrado`, descripcion: 'Cerrado', esCierre: true },
          })
          const usuarios = crearServicioUsuarios({
            usuario: tx.usuario,
            pais: tx.pais,
            provincia: tx.provincia,
            transaccion: (trabajo) => trabajo(tx),
          })
          const ajustadores = crearServicioAjustadores(tx)
          assert.equal((await usuarios.siniestrosActivos(actor, usuario.id, 1)).casosActivos, 0)
          assert.equal((await ajustadores.siniestrosActivos(ajustador.id, 1)).casosActivos, 0)
          await tx.sesion.create({
            data: {
              idUsuario: usuario.id,
              tokenHash: hashToken(marca),
              fechaVencimiento: new Date(Date.now() + 60_000),
            },
          })
          const caso = (numero, extra = {}) =>
            tx.siniestro.create({
              data: {
                numeroSiniestro: `${marca}-${numero}`,
                numeroPoliza: marca,
                fechaAsignacion: new Date(),
                demorado: false,
                menorEdadInvolucrado: false,
                idUsuario: usuario.id,
                idAjustador: ajustador.id,
                idAseguradora: aseguradora.id,
                idEstadoSiniestro: abierto.id,
                ...extra,
              },
            })
          const activos = []
          for (let numero = 1; numero <= 6; numero++) activos.push(await caso(numero))
          const ficha = await crearServicioSiniestros(tx).obtener(actor, activos[0].id)
          assert.equal(
            ficha.id,
            activos[0].id,
            'el enlace corresponde a una ficha accesible para el administrador',
          )
          const resuelto = await caso('cerrado', { idEstadoSiniestro: cerrado.id })
          const baja = await caso('baja', { eliminado: true, fechaBaja: new Date() })
          await caso('ajeno', { idUsuario: otro.id, idAjustador: otroAjustador.id })
          for (const consultar of [
            (pagina) => usuarios.siniestrosActivos(actor, usuario.id, pagina),
            (pagina) => ajustadores.siniestrosActivos(ajustador.id, pagina),
          ]) {
            const primera = siniestrosActivosAsociadosSchema.parse(await consultar(1))
            const segunda = siniestrosActivosAsociadosSchema.parse(await consultar(2))
            assert.equal(primera.casosActivos, 6)
            assert.equal(primera.siniestros.length, 5)
            assert.equal(segunda.siniestros.length, 1)
            assert.deepEqual(
              [...primera.siniestros, ...segunda.siniestros].map((s) => s.id),
              activos.map((s) => s.id),
            )
            assert.equal(primera.siniestros[0].aseguradora, aseguradora.nombre)
            assert.equal(primera.siniestros[0].estado, abierto.nombre)
            assert.equal(Object.hasOwn(primera, 'contrasena'), false)
          }
          await assert.rejects(usuarios.siniestrosActivos(actor, actor.id, 1), status(403))
          await assert.rejects(usuarios.siniestrosActivos(usuario, otro.id, 1), status(403))
          await assert.rejects(usuarios.siniestrosActivos(actor, 2147483647, 1), status(404))
          await assert.rejects(ajustadores.siniestrosActivos(2147483647, 1), status(404))
          // El servicio consulta el rol vigente aunque la sesión conserve el anterior.
          await tx.usuario.update({ where: { id: actor.id }, data: { tipoUsuario: 'GESTOR' } })
          await assert.rejects(usuarios.siniestrosActivos(actor, usuario.id, 1), status(403))
          await tx.usuario.update({
            where: { id: actor.id },
            data: { tipoUsuario: 'ADMINISTRADOR', eliminado: true, fechaBaja: new Date() },
          })
          await assert.rejects(usuarios.siniestrosActivos(actor, usuario.id, 1), status(401))
          await tx.usuario.update({
            where: { id: actor.id },
            data: { eliminado: false, fechaBaja: null },
          })
          const comprobarBloqueo = async (cantidad) => {
            for (const bloquear of [
              () => usuarios.darDeBaja(actor, usuario.id),
              () => ajustadores.darDeBaja(ajustador.id),
            ]) {
              await assert.rejects(
                bloquear(),
                (error) => error.status === 409 && error.details.casosActivos === cantidad,
              )
            }
            assert.equal(
              (await tx.usuario.findUnique({ where: { id: usuario.id } })).eliminado,
              false,
            )
            assert.equal(
              (await tx.ajustador.findUnique({ where: { id: ajustador.id } })).eliminado,
              false,
            )
            assert.equal(await tx.sesion.count({ where: { idUsuario: usuario.id } }), 1)
          }
          // El detalle inicialmente vacío no autoriza una baja si luego se asignaron casos.
          await comprobarBloqueo(6)
          await tx.siniestro.updateMany({
            where: { id: { in: activos.slice(0, 5).map((s) => s.id) } },
            data: { idUsuario: otro.id, idAjustador: otroAjustador.id },
          })
          await comprobarBloqueo(1)
          await tx.siniestro.update({
            where: { id: activos[5].id },
            data: { idEstadoSiniestro: cerrado.id },
          })
          assert.equal((await usuarios.siniestrosActivos(actor, usuario.id, 1)).casosActivos, 0)
          assert.equal((await ajustadores.siniestrosActivos(ajustador.id, 1)).casosActivos, 0)
          await usuarios.darDeBaja(actor, usuario.id)
          await ajustadores.darDeBaja(ajustador.id)
          assert.equal((await tx.usuario.findUnique({ where: { id: usuario.id } })).eliminado, true)
          assert.equal(
            (await tx.ajustador.findUnique({ where: { id: ajustador.id } })).eliminado,
            true,
          )
          assert.equal(await tx.sesion.count({ where: { idUsuario: usuario.id } }), 0)
          assert.equal(
            await tx.siniestro.count({ where: { id: { in: [resuelto.id, baja.id] } } }),
            2,
          )
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
