import assert from 'node:assert/strict'
import test from 'node:test'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioAjustadores } from '../src/modules/ajustadores/ajustadores.service.ts'

const conflicto = (campo) => (error) => error.status === 409 && error.details?.campo === campo

test('PostgreSQL: reglas de CU-03 dentro de una transacción reversible', async () => {
  const prisma = getPrisma()
  const rollback = new Error('Fin de prueba: revertir los datos')
  const marca = Date.now()
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const servicio = crearServicioAjustadores(tx)
          const aseguradora = (nombre, eliminado = false) =>
            tx.aseguradora.create({
              data: {
                nombre: `${nombre} ${marca}`,
                eliminado,
                fechaBaja: eliminado ? new Date() : null,
              },
            })
          const litoral = await aseguradora('Prueba Litoral')
          const andina = await aseguradora('Prueba Andina')
          const inactiva = await aseguradora('Prueba Inactiva', true)

          // Alta: valida email repetido (sin distinguir mayúsculas) y aseguradora activa
          const datos = {
            nombres: 'Ricardo',
            apellidos: 'Bengoechea',
            email: `rbengoechea.${marca}@example.invalid`,
            telefono: '11 4382-5510',
            idAseguradora: litoral.id,
          }
          const creado = await servicio.crear(datos)
          assert.equal(creado.casosActivos, 0)
          assert.deepEqual(creado.aseguradora, {
            id: litoral.id,
            nombre: litoral.nombre,
            eliminado: false,
          })
          await assert.rejects(
            servicio.crear({ ...datos, email: datos.email.toUpperCase() }),
            conflicto('email'),
          )
          await assert.rejects(
            servicio.crear({
              ...datos,
              email: `otro.${marca}@example.invalid`,
              idAseguradora: inactiva.id,
            }),
            conflicto('idAseguradora'),
          )
          await assert.rejects(
            servicio.crear({
              ...datos,
              email: `otro.${marca}@example.invalid`,
              idAseguradora: 2147483647,
            }),
            conflicto('idAseguradora'),
          )

          // Casos activos: cuenta los siniestros sin eliminar y en un estado que no es el de cierre
          const abierto = await tx.estadoSiniestro.create({
            data: { nombre: `Prueba abierto ${marca}`, descripcion: '-' },
          })
          const cierre = await tx.estadoSiniestro.create({
            data: { nombre: `Prueba cierre ${marca}`, descripcion: '-', esCierre: true },
          })
          const direccion = await tx.direccion.create({ data: {} })
          const gestor = await tx.usuario.create({
            data: {
              nombres: 'Prueba',
              apellidos: 'Gestor',
              documento: '0',
              telefono: '0',
              email: `gestor.${marca}@example.invalid`,
              contrasena: '-',
              tipoUsuario: 'GESTOR',
              idDireccion: direccion.id,
            },
          })
          const siniestro = (idEstadoSiniestro, extra = {}) =>
            tx.siniestro.create({
              data: {
                numeroSiniestro: 'P-1',
                numeroPoliza: 'P-1',
                fechaAsignacion: new Date(),
                demorado: false,
                menorEdadInvolucrado: false,
                idEstadoSiniestro,
                idAseguradora: litoral.id,
                idUsuario: gestor.id,
                idAjustador: creado.id,
                ...extra,
              },
            })
          const activo = await siniestro(abierto.id)
          await siniestro(cierre.id)
          await siniestro(abierto.id, { eliminado: true, fechaBaja: new Date() })
          const listado = (await servicio.listar(false)).find((a) => a.id === creado.id)
          assert.equal(listado?.casosActivos, 1)

          // Con un siniestro activo: se pueden cambiar sus datos, pero no la aseguradora ni darlo de baja
          const modificado = await servicio.modificar(creado.id, { telefono: '11 0000-0000' })
          assert.equal(modificado.telefono, '11 0000-0000')
          await assert.rejects(
            servicio.modificar(creado.id, { idAseguradora: andina.id }),
            conflicto('idAseguradora'),
          )
          await assert.rejects(servicio.darDeBaja(creado.id), (error) => {
            assert.equal(error.status, 409)
            assert.deepEqual(error.details, {
              codigo: 'AJUSTADOR_CON_SINIESTROS',
              idAjustador: creado.id,
              nombreAjustador: 'Ricardo Bengoechea',
              casosActivos: 1,
            })
            return true
          })

          // Cerrado el siniestro, ya puede cambiar de aseguradora y darse de baja
          await tx.siniestro.update({
            where: { id: activo.id },
            data: { idEstadoSiniestro: cierre.id },
          })
          assert.equal(
            (await servicio.modificar(creado.id, { idAseguradora: andina.id })).aseguradora.id,
            andina.id,
          )
          await servicio.darDeBaja(creado.id)
          assert.equal(
            (await servicio.listar(false)).some((a) => a.id === creado.id),
            false,
          )
          const baja = (await servicio.listar(true)).find((a) => a.id === creado.id)
          assert.equal(baja?.eliminado, true)
          assert.ok(baja?.fechaBaja instanceof Date)
          await assert.rejects(servicio.darDeBaja(creado.id), (error) => error.status === 409)
          await assert.rejects(
            servicio.modificar(creado.id, { telefono: '1' }),
            (error) => error.status === 409,
          )
          // El email de un dado de baja sigue ocupado: el mensaje indica cómo reactivarlo
          await assert.rejects(servicio.crear(datos), (error) => /dado de baja/.test(error.message))

          // Reactivar: no si su aseguradora está dada de baja
          await tx.aseguradora.update({
            where: { id: andina.id },
            data: { eliminado: true, fechaBaja: new Date() },
          })
          await assert.rejects(servicio.reactivar(creado.id), (error) => error.status === 409)
          await tx.aseguradora.update({
            where: { id: andina.id },
            data: { eliminado: false, fechaBaja: null },
          })
          await servicio.reactivar(creado.id)
          const reactivado = (await servicio.listar(false)).find((a) => a.id === creado.id)
          assert.equal(reactivado?.fechaBaja, null)
          await assert.rejects(servicio.reactivar(creado.id), (error) => error.status === 409)
          await assert.rejects(servicio.reactivar(2147483647), (error) => error.status === 404)
          throw rollback
        },
        { timeout: 10_000 },
      ),
      (error) => error === rollback,
    )
    assert.equal(
      await prisma.aseguradora.count({ where: { nombre: { endsWith: String(marca) } } }),
      0,
    )
  } finally {
    await disconnectPrisma()
  }
})
