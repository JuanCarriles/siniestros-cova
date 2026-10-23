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
          // La limpieza solo retira las filas antiguas: conserva cargas reales con el mismo nombre.
          const ficticias = [
            ['Formulario de cierre.pdf', 'plantillas/formulario-de-cierre.pdf'],
            ['Planilla de daños.xlsx', 'plantillas/planilla-de-danos.xlsx'],
            [
              'Modelo de denuncia administrativa.docx',
              'plantillas/modelo-de-denuncia-administrativa.docx',
            ],
          ]
          const idsFicticios = []
          for (const [nombreOriginal, urlArchivo] of ficticias) {
            const filaPrueba = await tx.documentoPlantilla.create({
              data: {
                encabezado: nombreOriginal,
                nombreOriginal,
                urlArchivo,
                tipoExtension: nombreOriginal.split('.').pop(),
                idUsuario: admin.id,
              },
            })
            idsFicticios.push(filaPrueba.id)
          }
          const realMismoNombre = await tx.documentoPlantilla.create({
            data: {
              encabezado: 'Archivo real',
              nombreOriginal: 'Formulario de cierre.pdf',
              urlArchivo: 'plantillas/00000000-0000-4000-8000-000000000001.pdf',
              tipoExtension: 'pdf',
              tamanoBytes: 42n,
              idUsuario: admin.id,
            },
          })
          const limpieza = await readFile(
            new URL(
              '../prisma/migrations/20261023140000_quitar_plantillas_ficticias/migration.sql',
              import.meta.url,
            ),
            'utf8',
          )
          await tx.$executeRawUnsafe(limpieza)
          assert.equal(
            await tx.documentoPlantilla.count({ where: { id: { in: idsFicticios } } }),
            0,
          )
          assert.ok(await tx.documentoPlantilla.findUnique({ where: { id: realMismoNombre.id } }))
          assert.ok(await tx.documentoPlantilla.findUnique({ where: { id: creada.id } }))

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
          const servicioSincronizado = crearServicioPlantillas({
            prisma: tx,
            almacenamiento: () => ({
              comprobarExistencia: async (key) => {
                if (key === realMismoNombre.urlArchivo)
                  throw new HttpError(404, 'Archivo eliminado en R2')
              },
            }),
          })
          const sincronizadas = await servicioSincronizado.listar(gestor.id)
          assert.equal(
            sincronizadas.some((p) => p.id === realMismoNombre.id),
            false,
          )
          assert.ok(sincronizadas.some((p) => p.id === intacta.id))
          assert.equal(
            await tx.documentoPlantilla.findUnique({ where: { id: realMismoNombre.id } }),
            null,
          )
          assert.ok(await tx.documentoPlantilla.findUnique({ where: { id: intacta.id } }))
          // Un timeout conserva físicamente el registro.
          const servicioSinConexion = crearServicioPlantillas({
            prisma: tx,
            almacenamiento: () => ({
              comprobarExistencia: async () => {
                throw new HttpError(503, 'Timeout')
              },
            }),
          })
          await assert.rejects(servicioSinConexion.listar(admin.id), { status: 503 })
          assert.ok(await tx.documentoPlantilla.findUnique({ where: { id: intacta.id } }))
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
