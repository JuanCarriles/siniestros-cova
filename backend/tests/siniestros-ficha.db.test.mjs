import assert from 'node:assert/strict'
import test from 'node:test'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioDocumentosFicha } from '../src/modules/documentos/documentos-ficha.service.ts'
import { crearServicioHistorialFicha } from '../src/modules/historial/historial-ficha.service.ts'
import { crearServicioNovedadesFicha } from '../src/modules/novedades/novedades-ficha.service.ts'
import { crearServicioAbogadosFicha } from '../src/modules/siniestros/abogados/abogados-ficha.service.ts'
import { crearServicioPeritosFicha } from '../src/modules/siniestros/peritos/peritos-ficha.service.ts'
import { crearServicioSiniestros } from '../src/modules/siniestros/siniestros.service.ts'
import { crearServicioVehiculosFicha } from '../src/modules/siniestros/vehiculos/vehiculos-ficha.service.ts'

const DIA = 24 * 60 * 60 * 1000

test('PostgreSQL: ficha del siniestro y sus pestañas (CU-10, E5-01) dentro de una transacción reversible', async () => {
  const prisma = getPrisma()
  const rollback = new Error('Fin de prueba: revertir los datos')
  const marca = Date.now()
  const ahora = new Date()
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const abierto = await tx.estadoSiniestro.findFirstOrThrow({ where: { esCierre: false } })
          const provincia = await tx.provincia.findFirstOrThrow({ include: { pais: true } })
          const tipoDni = await tx.tipoDocumento.findFirstOrThrow()
          const aseguradora = await tx.aseguradora.create({
            data: { nombre: `Prueba E5-01 ${marca}` },
          })
          const ajustador = await tx.ajustador.create({
            data: {
              nombres: 'Ricardo',
              apellidos: 'Bengoechea',
              email: `rb.${marca}@example.invalid`,
              telefono: '11 4382-5510',
              idAseguradora: aseguradora.id,
            },
          })
          const usuario = async (nombre, tipoUsuario) =>
            tx.usuario.create({
              data: {
                nombres: nombre,
                apellidos: 'Prueba',
                documento: '0',
                telefono: '0',
                email: `${nombre.toLowerCase()}.${marca}@example.invalid`,
                contrasena: '-',
                tipoUsuario,
                idDireccion: (await tx.direccion.create({ data: {} })).id,
              },
            })
          const gestorA = await usuario('Ana', 'GESTOR')
          const gestorB = await usuario('Beto', 'GESTOR')
          const admin = {
            id: 0,
            nombres: 'A',
            apellidos: 'A',
            email: 'a@x.test',
            tipoUsuario: 'ADMINISTRADOR',
          }
          const sesionA = { ...gestorA, tipoUsuario: 'GESTOR' }

          const direccion = async (datos) =>
            (await tx.direccion.create({ data: { idProvincia: provincia.id, ...datos } })).id

          const siniestro = await tx.siniestro.create({
            data: {
              numeroSiniestro: `F-${marca}`,
              numeroPoliza: '44-9820117',
              inicioVigencia: '01/11/2025',
              sucursal: 'Casa central',
              fechaAsignacion: new Date(ahora.getTime() - 10 * DIA),
              fechaUltimoMovimiento: new Date(ahora.getTime() - 4 * DIA - 60_000),
              demorado: false,
              menorEdadInvolucrado: true,
              causa: 'Colisión por alcance',
              fechaOcurrencia: new Date('2026-01-27T00:00:00Z'),
              horaOcurrencia: new Date('1970-01-01T18:40:00Z'),
              idEstadoSiniestro: abierto.id,
              idAseguradora: aseguradora.id,
              idAjustador: ajustador.id,
              idUsuario: gestorA.id,
              idDireccion: await direccion({
                localidad: 'Almagro',
                calle: 'Av. Rivadavia',
                codigoPostal: '1176',
              }),
            },
          })
          const idSiniestro = siniestro.id

          // Vehículos: el tercero se carga primero y sin personas (CU-09 11.a); el asegurado, con titular y ocupante;
          // uno dado de baja no aparece
          const tercero = await tx.vehiculo.create({
            data: { idSiniestro, dominio: 'AE552LT', rolAccidente: 'TERCERO', marca: 'Fiat' },
          })
          const asegurado = await tx.vehiculo.create({
            data: {
              idSiniestro,
              dominio: 'AB123CD',
              rolAccidente: 'ASEGURADO',
              marca: 'Ford',
              modelo: 'Ranger',
              anio: 2019,
              uso: 'PARTICULAR',
              idAseguradora: aseguradora.id,
            },
          })
          await tx.vehiculo.create({
            data: { idSiniestro, dominio: 'ZZ000ZZ', eliminado: true, fechaBaja: ahora },
          })

          const abogado = await tx.abogado.create({
            data: { nombreCompleto: `Dr. Luis Maidana ${marca}`, numeroMatricula: 'T° 45 F° 112' },
          })
          const abogadoBaja = await tx.abogado.create({
            data: { nombreCompleto: 'Dado de baja', eliminado: true, fechaBaja: ahora },
          })
          const titular = await tx.personaInvolucrada.create({
            data: {
              idSiniestro,
              idVehiculo: asegurado.id,
              nombreCompletoRazonSocial: 'Alejandro Sosa',
              idTipoDocumento: tipoDni.id,
              documento: '25884301',
              esPropietario: true,
              esOcupante: true,
              rolEnVehiculo: 'Conductor/a',
              fechaVencimientoCarnet: new Date('2028-05-01T00:00:00Z'),
              idAbogado: abogado.id,
              idDireccion: await direccion({ localidad: 'Caballito' }),
            },
          })
          const ocupante = await tx.personaInvolucrada.create({
            data: {
              idSiniestro,
              idVehiculo: asegurado.id,
              esPropietario: false,
              esOcupante: true,
              rolEnVehiculo: 'Acompañante',
              relacionPropietario: 'Hijo',
              tipoLesion: 'GRAVE',
              descripcionLesiones: 'Fractura',
              idAbogado: abogadoBaja.id,
            },
          })
          const peaton = await tx.personaInvolucrada.create({
            data: {
              idSiniestro,
              nombreCompletoRazonSocial: 'Ramón Ibáñez',
              esOcupante: false,
              rolSinVehiculo: 'Peatón',
              idAbogado: abogado.id,
            },
          })
          await tx.personaInvolucrada.create({
            data: {
              idSiniestro,
              nombreCompletoRazonSocial: 'Baja',
              eliminado: true,
              fechaBaja: ahora,
            },
          })

          await tx.perito.createMany({
            data: [
              {
                idSiniestro,
                tipoPerito: 'MEDICO',
                nombre: 'Dra. Vera',
                fechaSolicitud: new Date('2026-02-01T03:00:00Z'),
                fechaCierre: new Date('2026-02-10T03:00:00Z'),
                cerrado: true,
              },
              {
                idSiniestro,
                tipoPerito: 'CESVI',
                nombre: 'Ing. Lagos',
                fechaSolicitud: new Date('2026-02-05T03:00:00Z'),
                cerrado: false,
              },
              {
                idSiniestro,
                tipoPerito: 'CESVI',
                nombre: 'Baja',
                fechaSolicitud: ahora,
                cerrado: false,
                eliminado: true,
                fechaBaja: ahora,
              },
            ],
          })
          await tx.novedadSiniestro.createMany({
            data: [
              {
                idSiniestro,
                descripcion: 'Segunda',
                autor: 'Ana Prueba',
                fechaCarga: new Date('2026-02-03T12:00:00Z'),
              },
              {
                idSiniestro,
                descripcion: 'Primera',
                autor: 'Ana Prueba',
                fechaCarga: new Date('2026-02-02T12:00:00Z'),
              },
              {
                idSiniestro,
                descripcion: 'Baja',
                autor: 'Ana Prueba',
                eliminado: true,
                fechaBaja: ahora,
              },
            ],
          })
          const documento = (nombreOriginal, extra = {}) => ({
            idSiniestro,
            idUsuario: gestorA.id,
            nombreOriginal,
            urlArchivoSinDominio: `siniestros/${idSiniestro}/${nombreOriginal}`,
            tipoExtension: 'pdf',
            mimeType: 'application/pdf',
            tamanoBytes: 2048n,
            ...extra,
          })
          await tx.documentoSiniestro.createMany({
            data: [
              documento('viejo.pdf', { fechaCarga: new Date('2026-02-01T12:00:00Z') }),
              documento('nuevo.pdf', { fechaCarga: new Date('2026-02-04T12:00:00Z') }),
              documento('baja.pdf', { eliminado: true, fechaBaja: ahora }),
            ],
          })
          await tx.historialSiniestro.createMany({
            data: [
              {
                idSiniestro,
                idUsuario: gestorA.id,
                tipoEvento: 'DOCUMENTO',
                descripcion: 'Después',
                fechaEvento: new Date('2026-02-04T12:00:00Z'),
              },
              {
                idSiniestro,
                idUsuario: gestorA.id,
                tipoEvento: 'ASIGNACION',
                descripcion: 'Antes',
                fechaEvento: new Date('2026-02-01T12:00:00Z'),
              },
            ],
          })

          // Cabecera y datos del caso
          const ficha = await crearServicioSiniestros(tx, () => ahora).obtener(sesionA, idSiniestro)
          assert.equal(ficha.ajustador.nombre, 'Ricardo Bengoechea')
          assert.equal(ficha.asignado.nombre, 'Ana Prueba')
          assert.equal(ficha.diasSinMovimiento, 4)
          assert.equal(ficha.fechaBaja, null)
          assert.deepEqual(ficha.hecho, {
            fechaOcurrencia: '2026-01-27',
            horaOcurrencia: '18:40',
            menorEdadInvolucrado: true,
            causa: 'Colisión por alcance',
          })
          assert.deepEqual(ficha.lugar, {
            pais: provincia.pais.nombre,
            provincia: provincia.nombre,
            localidad: 'Almagro',
            calle: 'Av. Rivadavia',
            codigoPostal: '1176',
          })
          // 2 vehículos + 1 persona fuera; el abogado dado de baja no cuenta
          assert.deepEqual(ficha.cantidades, {
            vehiculosYPartes: 3,
            abogados: 1,
            peritos: 2,
            novedades: 2,
            documentos: 2,
          })

          // Vehículos y partes: el asegurado primero; el tercero, sin titular ni ocupantes
          const partes = await crearServicioVehiculosFicha(tx).listar(sesionA, idSiniestro)
          assert.deepEqual(
            partes.vehiculos.map((v) => v.id),
            [asegurado.id, tercero.id],
          )
          const [conPersonas, sinPersonas] = partes.vehiculos
          assert.equal(conPersonas.aseguradora, aseguradora.nombre)
          assert.equal(conPersonas.titular.id, titular.id)
          assert.equal(conPersonas.titular.ibaEnVehiculo, true)
          assert.equal(conPersonas.titular.lugarEnVehiculo, 'Conductor/a')
          assert.equal(conPersonas.titular.tipoDocumento, tipoDni.nombre)
          assert.equal(conPersonas.titular.fechaVencimientoCarnet, '2028-05-01')
          assert.equal(conPersonas.titular.domicilio.localidad, 'Caballito')
          assert.equal(conPersonas.titular.abogado.id, abogado.id)
          assert.deepEqual(
            conPersonas.ocupantes.map((o) => [
              o.id,
              o.nombre,
              o.relacionTitular,
              o.lesion.tipo,
              o.abogado,
            ]),
            [[ocupante.id, null, 'Hijo', 'GRAVE', null]],
          )
          assert.equal(sinPersonas.titular, null)
          assert.deepEqual(sinPersonas.ocupantes, [])
          assert.deepEqual(
            partes.personasFuera.map((p) => [p.id, p.rolSinVehiculo]),
            [[peaton.id, 'Peatón']],
          )

          // Abogados: solo los activos, con quienes representan en este siniestro
          const abogados = await crearServicioAbogadosFicha(tx).listar(sesionA, idSiniestro)
          assert.deepEqual(
            abogados.map((a) => [a.id, a.representa.map((p) => p.nombre)]),
            [[abogado.id, ['Alejandro Sosa', 'Ramón Ibáñez']]],
          )

          // Peritos: CESVI antes que médico; la fecha de cierre solo si tiene
          const peritos = await crearServicioPeritosFicha(tx).listar(sesionA, idSiniestro)
          assert.deepEqual(
            peritos.map((p) => [p.tipo, p.nombre, p.cerrado, p.fechaCierre]),
            [
              ['CESVI', 'Ing. Lagos', false, null],
              ['MEDICO', 'Dra. Vera', true, '2026-02-10T03:00:00.000Z'],
            ],
          )

          const novedades = await crearServicioNovedadesFicha(tx).listar(sesionA, idSiniestro)
          assert.deepEqual(
            novedades.map((n) => n.descripcion),
            ['Primera', 'Segunda'],
          )

          // Documentos: del más nuevo al más viejo, sin la clave de R2
          const documentos = await crearServicioDocumentosFicha(tx).listar(sesionA, idSiniestro)
          assert.deepEqual(
            documentos.map((d) => d.nombreOriginal),
            ['nuevo.pdf', 'viejo.pdf'],
          )
          assert.equal(documentos[0].tamanoBytes, '2048')
          assert.deepEqual(documentos[0].autor, { nombre: 'Ana Prueba', tipoUsuario: 'GESTOR' })
          assert.ok(!('urlArchivoSinDominio' in documentos[0]))

          const historial = await crearServicioHistorialFicha(tx).listar(sesionA, idSiniestro)
          assert.deepEqual(
            historial.map((e) => [e.tipo, e.descripcion]),
            [
              ['ASIGNACION', 'Antes'],
              ['DOCUMENTO', 'Después'],
            ],
          )

          // Cada pestaña controla el acceso: un gestor ajeno recibe 403; el administrador entra
          const pestanas = [
            crearServicioVehiculosFicha(tx),
            crearServicioAbogadosFicha(tx),
            crearServicioPeritosFicha(tx),
            crearServicioNovedadesFicha(tx),
            crearServicioDocumentosFicha(tx),
            crearServicioHistorialFicha(tx),
          ]
          const sesionB = { ...gestorB, tipoUsuario: 'GESTOR' }
          for (const pestana of pestanas) {
            await assert.rejects(pestana.listar(sesionB, idSiniestro), (e) => e.status === 403)
            await assert.rejects(pestana.listar(admin, 2147483647), (e) => e.status === 404)
            await pestana.listar(admin, idSiniestro)
          }
          throw rollback
        },
        { timeout: 30_000 },
      ),
      (error) => error === rollback,
    )
  } finally {
    await disconnectPrisma()
  }
})
