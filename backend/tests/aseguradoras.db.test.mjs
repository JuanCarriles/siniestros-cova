import assert from 'node:assert/strict'
import test from 'node:test'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioAseguradoras } from '../src/modules/aseguradoras/aseguradoras.service.ts'

test('PostgreSQL: listado, conteo y cambios de estado persisten dentro de una transacción reversible', async () => {
  const prisma = getPrisma()
  const rollback = new Error('Fin de prueba: revertir los datos')
  let id
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const servicio = crearServicioAseguradoras(tx)
          const creada = await servicio.crear({ nombre: `Prueba E2-01 ${Date.now()}` })
          id = creada.id
          assert.equal(creada.cantidadAjustadores, 0)

          await tx.ajustador.create({
            data: {
              nombres: 'Prueba',
              apellidos: 'Activo',
              email: 'prueba@example.invalid',
              telefono: '0',
              idAseguradora: id,
            },
          })
          await tx.ajustador.create({
            data: {
              nombres: 'Prueba',
              apellidos: 'Baja',
              email: 'baja@example.invalid',
              telefono: '0',
              idAseguradora: id,
              eliminado: true,
              fechaBaja: new Date(),
            },
          })
          let fila = (await servicio.listar(false)).find((valor) => valor.id === id)
          assert.equal(fila?.cantidadAjustadores, 1)

          const modificada = await servicio.modificar(id, { nombre: 'Prueba E2-01 editada' })
          assert.equal(modificada.nombre, 'Prueba E2-01 editada')

          // CU-02 3.a: con un ajustador activo no se puede dar de baja
          await assert.rejects(
            servicio.darDeBaja(id),
            (error) => error.status === 409 && error.details?.cantidadAjustadores === 1,
          )
          await tx.ajustador.updateMany({
            where: { idAseguradora: id, eliminado: false },
            data: { eliminado: true, fechaBaja: new Date() },
          })
          await servicio.darDeBaja(id)
          assert.equal(
            (await servicio.listar(false)).some((valor) => valor.id === id),
            false,
          )
          fila = (await servicio.listar(true)).find((valor) => valor.id === id)
          assert.equal(fila?.eliminado, true)
          assert.ok(fila?.fechaBaja instanceof Date)
          assert.equal(await tx.ajustador.count({ where: { idAseguradora: id } }), 2)

          await servicio.reactivar(id)
          fila = (await servicio.listar(false)).find((valor) => valor.id === id)
          assert.equal(fila?.eliminado, false)
          assert.equal(fila?.fechaBaja, null)
          assert.equal(fila?.cantidadAjustadores, 0)
          throw rollback
        },
        { timeout: 10_000 },
      ),
      (error) => error === rollback,
    )
    assert.equal(await prisma.aseguradora.findUnique({ where: { id } }), null)
  } finally {
    await disconnectPrisma()
  }
})
