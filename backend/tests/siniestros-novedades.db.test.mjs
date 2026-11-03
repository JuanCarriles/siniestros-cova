import assert from 'node:assert/strict'
import test from 'node:test'
import { novedadSchema } from '@cova/shared/schemas/novedades'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearServicioNovedadesFicha } from '../src/modules/novedades/novedades-ficha.service.ts'
import { crearServicioNovedadesGestion } from '../src/modules/novedades/novedades-gestion.service.ts'

// CU-10 1.f y 1.f.1 (E5-08): cargar y leer novedades desde la ficha
test('PostgreSQL: cargar y leer novedades desde la ficha', async () => {
  const prisma = getPrisma()
  const rollback = new Error('Fin de prueba: revertir los datos')
  const marca = Date.now()
  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const abierto = await tx.estadoSiniestro.findFirstOrThrow({ where: { esCierre: false } })
          const cierre = await tx.estadoSiniestro.findFirstOrThrow({ where: { esCierre: true } })
          const aseguradora = await tx.aseguradora.create({
            data: { nombre: `Novedades ${marca}` },
          })
          const usuario = async (nombres, tipoUsuario, extra = {}) => {
            const u = await tx.usuario.create({
              data: {
                nombres,
                apellidos: 'Prueba',
                documento: '0',
                telefono: '0',
                email: `${nombres.toLowerCase()}.novedades.${marca}@example.invalid`,
                contrasena: '-',
                tipoUsuario,
                idDireccion: (await tx.direccion.create({ data: {} })).id,
                ...extra,
              },
            })
            return { ...u, tipoUsuario }
          }
          const gestora = await usuario('Ana', 'GESTOR')
          const otroGestor = await usuario('Bruno', 'GESTOR')
          const admin = await usuario('Carla', 'ADMINISTRADOR')
          const adminDeBaja = await usuario('Dario', 'ADMINISTRADOR', {
            eliminado: true,
            fechaBaja: new Date(),
          })

          const ultimoMovimiento = new Date('2026-10-01T12:00:00Z')
          const siniestro = (numero, extra = {}) =>
            tx.siniestro.create({
              data: {
                numeroSiniestro: `${numero}-${marca}`,
                numeroPoliza: 'P',
                fechaAsignacion: new Date('2026-09-01T12:00:00Z'),
                fechaUltimoMovimiento: ultimoMovimiento,
                demorado: false,
                menorEdadInvolucrado: false,
                idEstadoSiniestro: abierto.id,
                idAseguradora: aseguradora.id,
                idUsuario: gestora.id,
                ...extra,
              },
            })
          const caso = await siniestro('NOVEDADES')
          const cerrado = await siniestro('CERRADO', { idEstadoSiniestro: cierre.id })
          const deBaja = await siniestro('BAJA', { eliminado: true, fechaBaja: new Date() })

          const base = { transaccion: (trabajo) => trabajo(tx) }
          const novedades = crearServicioNovedadesGestion(base)
          const lectura = crearServicioNovedadesFicha(tx)
          const novedad = (descripcion) => novedadSchema.parse({ descripcion })
          const avisados = async (idNovedadDesde) =>
            (
              await tx.notificacion.findMany({
                where: { idSiniestro: caso.id, id: { gt: idNovedadDesde } },
                select: { idUsuario: true, tipoNotificacion: true, mensaje: true },
              })
            ).map((n) => n.idUsuario)
          const ultimaNotificacion = async () =>
            (await tx.notificacion.aggregate({ _max: { id: true } }))._max.id ?? 0
          const administracionActiva = (
            await tx.usuario.findMany({
              where: {
                eliminado: false,
                tipoUsuario: { in: ['ADMINISTRADOR', 'SUPER_ADMINISTRADOR'] },
              },
              select: { id: true },
            })
          ).map((u) => u.id)

          // El texto se valida igual en el formulario y en el servidor: sin texto o solo espacios, no
          assert.equal(novedadSchema.safeParse({ descripcion: '   ' }).success, false)
          assert.equal(novedadSchema.safeParse({ descripcion: 'x'.repeat(4001) }).success, false)
          assert.equal(novedad('  Llamé al tercero.  ').descripcion, 'Llamé al tercero.')

          // La gestora carga una: queda con su autor, es movimiento, va al historial y avisa a la administración
          let desde = await ultimaNotificacion()
          await novedades.cargar(gestora, caso.id, novedad('Llamé al tercero.'))
          const movimiento = (await tx.siniestro.findUniqueOrThrow({ where: { id: caso.id } }))
            .fechaUltimoMovimiento
          assert.ok(movimiento > ultimoMovimiento, 'cargar una novedad es movimiento del caso')
          assert.deepEqual(
            (await avisados(desde)).sort((a, b) => a - b),
            [...administracionActiva].sort((a, b) => a - b),
            'avisa a toda la administración activa, no a quien la cargó',
          )
          assert.ok(!administracionActiva.includes(adminDeBaja.id))
          const aviso = await tx.notificacion.findFirstOrThrow({
            where: { idSiniestro: caso.id, idUsuario: admin.id },
          })
          assert.equal(aviso.tipoNotificacion, 'NOVEDAD_CARGADA')
          assert.equal(
            aviso.mensaje,
            `Ana Prueba cargó una novedad en el siniestro NOVEDADES-${marca}`,
          )
          assert.equal(aviso.leida, false)

          // Un administrador carga otra: avisa a la gestora asignada y al resto de la administración, no a él
          desde = await ultimaNotificacion()
          await novedades.cargar(
            admin,
            caso.id,
            novedad('Pedí el informe al perito.\nSegunda línea.'),
          )
          const segundos = await avisados(desde)
          assert.ok(segundos.includes(gestora.id))
          assert.ok(!segundos.includes(admin.id))
          assert.ok(!segundos.includes(otroGestor.id), 'un gestor de otros casos no se entera')
          assert.equal(segundos.length, administracionActiva.length)

          // Historial: una línea por novedad, con su autor
          const historial = await tx.historialSiniestro.findMany({
            where: { idSiniestro: caso.id },
            orderBy: { id: 'asc' },
            select: { tipoEvento: true, idUsuario: true, descripcion: true },
          })
          assert.deepEqual(
            historial.map((e) => [e.tipoEvento, e.idUsuario, e.descripcion.replace(/ el .*$/, '')]),
            [
              ['NOVEDAD', gestora.id, 'Ana Prueba cargó una novedad'],
              ['NOVEDAD', admin.id, 'Carla Prueba cargó una novedad'],
            ],
          )

          // Lectura: de la más nueva a la más vieja, con nombre, tipo de usuario y fecha y hora
          const lista = await lectura.listar(gestora, caso.id)
          assert.deepEqual(
            lista.map((n) => [n.descripcion, n.autor]),
            [
              [
                'Pedí el informe al perito.\nSegunda línea.',
                { nombre: 'Carla Prueba', tipoUsuario: 'ADMINISTRADOR' },
              ],
              ['Llamé al tercero.', { nombre: 'Ana Prueba', tipoUsuario: 'GESTOR' }],
            ],
          )
          assert.ok(!Number.isNaN(Date.parse(lista[0].fechaCarga)))
          const guardada = await tx.novedadSiniestro.findFirstOrThrow({
            where: { idSiniestro: caso.id, idUsuario: admin.id },
          })
          assert.equal(guardada.autor, 'Carla Prueba', 'guarda el nombre tal como era al cargarla')

          // Un gestor solo carga en sus casos
          await assert.rejects(
            novedades.cargar(otroGestor, caso.id, novedad('No es mío.')),
            (e) => e.status === 403,
          )
          // Cerrado o dado de baja: solo consulta
          await assert.rejects(
            novedades.cargar(admin, cerrado.id, novedad('Tarde.')),
            (e) => e.status === 409 && /cerrado/.test(e.message),
          )
          await assert.rejects(
            novedades.cargar(admin, deBaja.id, novedad('De baja.')),
            (e) => e.status === 409 && /dado de baja/.test(e.message),
          )
          await assert.rejects(
            novedades.cargar(gestora, 2147483647, novedad('No existe.')),
            (e) => e.status === 404,
          )
          assert.equal(
            await tx.novedadSiniestro.count({
              where: { idSiniestro: { in: [cerrado.id, deBaja.id] } },
            }),
            0,
          )

          // Las novedades no se editan ni se borran: el servicio solo sabe cargarlas
          assert.deepEqual(Object.keys(novedades), ['cargar'])
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
