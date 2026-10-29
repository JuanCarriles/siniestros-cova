import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { HttpError } from '../src/utils/httpError.ts'
import { crearServicioPlantillas } from '../src/modules/plantillas/plantillas.service.ts'

test('PostgreSQL: carga con fecha automática y autor real; consulta y descarga; rollback sin tocar datos existentes', async () => {
  const prisma = getPrisma()
  const rollback = new Error('Deshacer prueba de plantillas')
  const marca = Date.now()
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const direccion = await tx.direccion.create({ data: {} })
          const crearUsuario = (tipoUsuario) =>
            tx.usuario.create({
              data: {
                nombres: 'Prueba',
                apellidos: 'Plantillas',
                documento: '0',
                telefono: '0',
                email: `plantillas.${tipoUsuario}.${marca}@example.invalid`,
                contrasena: '-',
                tipoUsuario,
                idDireccion: direccion.id,
              },
            })
          const admin = await crearUsuario('ADMINISTRADOR')
          const gestor = await crearUsuario('GESTOR')
          const contenido = await readFile(
            new URL('./fixtures/plantillas/valido.pdf', import.meta.url),
          )
          const archivo = { nombreOriginal: 'carta.pdf', contenido }
          const clave = `plantillas/prueba-${marca}.pdf`
          const servicio = crearServicioPlantillas({
            prisma: tx,
            almacenamiento: () => ({
              subir: async () => ({
                clave,
                nombreOriginal: archivo.nombreOriginal,
                tipoExtension: 'pdf',
                tamanoBytes: BigInt(contenido.length),
              }),
              eliminar: async () => {},
              comprobarExistencia: async () => {},
              firmarDescarga: async (key) => {
                assert.equal(key, clave)
                return { url: 'firmada', venceEnSegundos: 60 }
              },
            }),
          })
          const inicio = Date.now() - 1000
          const creada = await servicio.subir(
            admin.id,
            { encabezado: 'Carta a tercero', descripcion: 'Documento de referencia' },
            archivo,
          )
          assert.equal(creada.subidoPor.id, admin.id)
          assert.ok(Date.parse(creada.fechaCarga) >= inicio)
          assert.equal(creada.tamanoBytes, contenido.length)
          const fila = await tx.documentoPlantilla.findUniqueOrThrow({ where: { id: creada.id } })
          assert.equal(fila.urlArchivo, clave)
          assert.equal(fila.encabezado, 'Carta a tercero')
          assert.equal(fila.descripcion, 'Documento de referencia')
          assert.ok((await servicio.listar(gestor.id)).some((p) => p.id === creada.id))
          assert.equal((await servicio.descargar(gestor.id, creada.id)).url, 'firmada')
          await assert.rejects(
            servicio.subir(gestor.id, { encabezado: 'No', descripcion: 'No' }, archivo),
            { status: 403 },
          )
          await tx.documentoPlantilla.update({
            where: { id: creada.id },
            data: { eliminado: true, fechaBaja: new Date() },
          })
          assert.equal(
            (await servicio.listar(admin.id)).some((p) => p.id === creada.id),
            false,
          )
          await assert.rejects(servicio.descargar(admin.id, creada.id), { status: 404 })
          const intacta = await tx.documentoPlantilla.create({
            data: {
              encabezado: 'Modelo vigente',
              nombreOriginal: 'vigente.pdf',
              urlArchivo: `plantillas/vigente-${marca}.pdf`,
              tipoExtension: 'pdf',
              tamanoBytes: 10n,
              idUsuario: admin.id,
            },
          })
          // El listado debe funcionar aun con R2 inaccesible y nunca retirar metadatos.
          const soloLectura = crearServicioPlantillas({
            prisma: tx,
            almacenamiento: () => {
              throw Error('R2 no disponible: listar no debe necesitarlo')
            },
          })
          const antes = await tx.documentoPlantilla.findUniqueOrThrow({ where: { id: intacta.id } })
          assert.ok((await soloLectura.listar(gestor.id)).some((p) => p.id === intacta.id))
          const sinArchivo = crearServicioPlantillas({
            prisma: tx,
            almacenamiento: () => ({
              comprobarExistencia: async () => {
                throw new HttpError(404, 'Archivo ausente')
              },
              firmarDescarga: async () => assert.fail('No firmar un archivo ausente'),
            }),
          })
          await assert.rejects(sinArchivo.descargar(gestor.id, intacta.id), { status: 404 })
          assert.ok((await sinArchivo.listar(admin.id)).some((p) => p.id === intacta.id))
          assert.deepEqual(
            await tx.documentoPlantilla.findUniqueOrThrow({ where: { id: intacta.id } }),
            antes,
          )
          // Borrar la plantilla no modifica una copia ya generada para un siniestro.
          const aseguradora = await tx.aseguradora.create({
            data: { nombre: `Eliminar plantilla ${marca}` },
          })
          const estado = await tx.estadoSiniestro.create({
            data: { nombre: `Eliminar plantilla ${marca}`, descripcion: '-' },
          })
          const caso = await tx.siniestro.create({
            data: {
              numeroSiniestro: 'P-ELIMINAR',
              numeroPoliza: 'P-ELIMINAR',
              fechaAsignacion: new Date(),
              demorado: false,
              menorEdadInvolucrado: false,
              idUsuario: gestor.id,
              idAseguradora: aseguradora.id,
              idEstadoSiniestro: estado.id,
            },
          })
          const generado = await tx.documentoSiniestro.create({
            data: {
              nombreOriginal: 'documento-generado.pdf',
              tipoExtension: 'pdf',
              mimeType: 'application/pdf',
              tamanoBytes: 10n,
              idUsuario: gestor.id,
              idSiniestro: caso.id,
              urlArchivoSinDominio: `siniestros/${caso.id}/copia-generada.pdf`,
            },
          })
          const eliminacionesR2 = []
          const servicioBorrado = crearServicioPlantillas({
            prisma: tx,
            almacenamiento: () => ({
              eliminar: async (key) => {
                eliminacionesR2.push(key)
              },
            }),
          })
          await assert.rejects(servicioBorrado.eliminar(gestor.id, intacta.id), { status: 403 })
          assert.equal(eliminacionesR2.length, 0)
          await servicioBorrado.eliminar(admin.id, intacta.id)
          assert.deepEqual(eliminacionesR2, [intacta.urlArchivo])
          assert.equal(await tx.documentoPlantilla.findUnique({ where: { id: intacta.id } }), null)
          assert.deepEqual(
            await tx.documentoSiniestro.findUnique({ where: { id: generado.id } }),
            generado,
          )
          await servicioBorrado.eliminar(admin.id, intacta.id)
          assert.equal(eliminacionesR2.length, 1)
          throw rollback
        },
        { timeout: 15000 },
      ),
      (error) => error === rollback,
    )
  } finally {
    await disconnectPrisma()
  }
})
