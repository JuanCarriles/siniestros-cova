import assert from 'node:assert/strict'
import test from 'node:test'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioSiniestros } from '../src/modules/siniestros/siniestros.service.ts'

const DIA = 24 * 60 * 60 * 1000

test('PostgreSQL: listado de siniestros (CU-09) dentro de una transacción reversible', async () => {
  const prisma = getPrisma()
  const rollback = new Error('Fin de prueba: revertir los datos')
  const marca = Date.now()
  const ahora = new Date()
  const hace = (dias) => new Date(ahora.getTime() - dias * DIA - 60_000)
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const servicio = crearServicioSiniestros(tx, () => ahora)
          const abierto = await tx.estadoSiniestro.findFirstOrThrow({ where: { esCierre: false } })
          const cierre = await tx.estadoSiniestro.findFirstOrThrow({ where: { esCierre: true } })
          const aseguradora = await tx.aseguradora.create({
            data: { nombre: `Prueba E4-01 ${marca}` },
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
          const abogado = await tx.abogado.create({
            data: { nombreCompleto: `Dra. Paula Sánchez ${marca}`, numeroMatricula: 54120 },
          })

          const siniestro = (numero, idUsuario, extra = {}) =>
            tx.siniestro.create({
              data: {
                numeroSiniestro: numero,
                numeroPoliza: `POL-${numero}`,
                fechaAsignacion: hace(20),
                fechaUltimoMovimiento: hace(1),
                demorado: false,
                menorEdadInvolucrado: false,
                idEstadoSiniestro: abierto.id,
                idAseguradora: aseguradora.id,
                idAjustador: ajustador.id,
                idUsuario,
                ...extra,
              },
            })
          // S1: abierto y sin movimientos hace 5 días (demorado), con asegurado, terceros, perito y abogado
          const s1 = await siniestro(`P1-${marca}`, gestorA.id, {
            fechaAsignacion: hace(10),
            fechaUltimoMovimiento: hace(5),
          })
          const asegurado = await tx.vehiculo.create({
            data: {
              dominio: 'AE 123-CD',
              marca: 'Toyota',
              modelo: 'Corolla',
              anio: 2021,
              rolAccidente: 'ASEGURADO',
            },
          })
          const tercero = await tx.vehiculo.create({
            data: { dominio: 'AF447TR', marca: 'Fiat', modelo: 'Cronos', rolAccidente: 'TERCERO' },
          })
          const persona = (data) =>
            tx.personaInvolucrada.create({ data: { idSiniestro: s1.id, ...data } })
          await persona({
            nombreCompletoRazonSocial: 'Martina Castro',
            idVehiculo: asegurado.id,
            esPropietario: true,
          })
          await persona({
            nombreCompletoRazonSocial: 'José Ríos',
            idVehiculo: tercero.id,
            esPropietario: true,
            documento: '28990112',
            idAbogado: abogado.id,
            tipoLesion: 'GRAVE',
            descripcionLesiones: 'Fractura de clavícula',
          })
          await persona({ nombreCompletoRazonSocial: 'Julio Benítez', rolSinVehiculo: 'Testigo' })
          await persona({
            nombreCompletoRazonSocial: 'Persona Borrada',
            eliminado: true,
            fechaBaja: hace(1),
          })
          await tx.perito.create({
            data: {
              idSiniestro: s1.id,
              tipoPerito: 'CESVI',
              nombre: 'Ing. Lagos',
              fechaSolicitud: hace(4),
              cerrado: false,
            },
          })
          // S2: cerrado hace 10 días (no cuenta como demorado), asignado después que S1
          const s2 = await siniestro(`P2-${marca}`, gestorB.id, {
            idEstadoSiniestro: cierre.id,
            fechaAsignacion: hace(8),
            fechaUltimoMovimiento: hace(10),
          })
          // S3: dado de baja
          const s3 = await siniestro(`P3-${marca}`, gestorA.id, {
            eliminado: true,
            fechaBaja: hace(2),
          })

          const filtros = (extra = {}) => ({
            pagina: 1,
            porPagina: 25,
            bajas: false,
            orden: 'asignacion',
            aseguradora: aseguradora.id,
            ...extra,
          })
          const ids = (pagina) => pagina.siniestros.map((s) => s.id)

          // Orden por defecto: asignación más reciente primero; las bajas solo con "bajas" y al final
          let pagina = await servicio.listar(admin, filtros())
          assert.deepEqual(ids(pagina), [s2.id, s1.id])
          assert.equal(pagina.total, 2)
          assert.deepEqual(pagina.resumen, { activos: 2, demorados: 1, bajas: 1 })
          assert.deepEqual(ids(await servicio.listar(admin, filtros({ bajas: true }))), [
            s2.id,
            s1.id,
            s3.id,
          ])

          // Fila: asegurado = titular del vehículo asegurado; terceros = todos los demás (sin los borrados)
          const fila = pagina.siniestros[1]
          assert.deepEqual(fila.asegurado?.nombre, 'Martina Castro')
          assert.deepEqual(
            fila.terceros.map((t) => t.nombre),
            ['José Ríos', 'Julio Benítez'],
          )
          assert.deepEqual(
            fila.abogados.map((a) => a.nombre),
            [abogado.nombreCompleto],
          )
          assert.deepEqual(fila.pericias.medico, null)
          assert.equal(fila.pericias.cesvi?.cerrada, false)
          assert.equal(fila.diasSinMovimiento, 5)
          assert.equal(fila.gestor.nombre, 'Ana Prueba')
          assert.equal(fila.ajustador?.nombre, 'Ricardo Bengoechea')

          // Orden por demora: los abiertos más quietos primero; los cerrados después
          assert.deepEqual(ids(await servicio.listar(admin, filtros({ orden: 'demora' }))), [
            s1.id,
            s2.id,
          ])

          // RF-17: el gestor ve solo los suyos, nunca los dados de baja
          pagina = await servicio.listar(gestorA, filtros({ bajas: true }))
          assert.deepEqual(ids(pagina), [s1.id])
          assert.equal(pagina.resumen.bajas, 0)
          assert.deepEqual(ids(await servicio.listar(admin, filtros({ gestor: gestorB.id }))), [
            s2.id,
          ])
          assert.deepEqual(ids(await servicio.listar(admin, filtros({ estado: cierre.id }))), [
            s2.id,
          ])

          // Búsqueda (RF-16): sin tildes ni mayúsculas, por persona, número, póliza o patente sin espacios
          for (const q of [
            'rios',
            'RÍOS',
            'benitez',
            'ae123cd',
            'AE-123 CD',
            `p1-${marca}`,
            `pol-p1-${marca}`,
          ]) {
            assert.deepEqual(ids(await servicio.listar(admin, filtros({ q }))), [s1.id], q)
          }
          // Los comodines de LIKE se buscan como texto
          assert.deepEqual(ids(await servicio.listar(admin, filtros({ q: '%' }))), [])
          // Una persona dada de baja no hace coincidir su siniestro
          assert.deepEqual(ids(await servicio.listar(admin, filtros({ q: 'Persona Borrada' }))), [])

          // Página fuera de rango: devuelve la última
          pagina = await servicio.listar(admin, filtros({ porPagina: 25, pagina: 99 }))
          assert.equal(pagina.pagina, 1)
          assert.equal(pagina.siniestros.length, 2)

          // Partes (CU-09 3.b y 3.c)
          const partes = await servicio.partes(admin, s1.id)
          assert.equal(partes.ajustador?.aseguradora, aseguradora.nombre)
          assert.deepEqual(
            partes.terceros.map((t) => [t.nombre, t.rol, t.vehiculo?.dominio ?? null]),
            [
              ['José Ríos', 'Titular del vehículo', 'AF447TR'],
              ['Julio Benítez', 'Testigo', null],
            ],
          )
          assert.deepEqual(partes.terceros[0].lesion, {
            tipo: 'GRAVE',
            descripcion: 'Fractura de clavícula',
          })
          assert.deepEqual(partes.abogados[0].representa, ['José Ríos'])
          assert.equal(partes.peritos[0].tipo, 'CESVI')
          await servicio.partes(gestorA, s1.id)
          // E4-03: abrir un siniestro ajeno es un error de permisos, también para sus partes
          await assert.rejects(servicio.partes(gestorB, s1.id), (e) => e.status === 403)
          await assert.rejects(servicio.partes(gestorA, s3.id), (e) => e.status === 403)

          // Ficha: el gestor abre los suyos; los ajenos y los dados de baja dan 403; el administrador, todos
          const ficha = await servicio.obtener(gestorA, s1.id)
          assert.deepEqual(
            [ficha.numeroSiniestro, ficha.aseguradora.id, ficha.gestor.id],
            [s1.numeroSiniestro, aseguradora.id, gestorA.id],
          )
          await assert.rejects(servicio.obtener(gestorB, s1.id), (e) => {
            assert.equal(e.status, 403)
            assert.match(e.message, /no está asignado a vos/)
            return true
          })
          await assert.rejects(servicio.obtener(gestorA, s3.id), (e) => e.status === 403)
          assert.equal((await servicio.obtener(admin, s3.id)).id, s3.id)
          await assert.rejects(servicio.obtener(admin, 2147483647), (e) => e.status === 404)
          await assert.rejects(servicio.obtener(gestorA, 2147483647), (e) => e.status === 404)

          // Opciones de los filtros: el gestor no recibe la lista de gestores
          assert.deepEqual((await servicio.opciones(gestorA)).gestores, [])
          assert.ok((await servicio.opciones(admin)).gestores.some((g) => g.id === gestorB.id))
          throw rollback
        },
        { timeout: 20_000 },
      ),
      (error) => error === rollback,
    )
  } finally {
    await disconnectPrisma()
  }
})
