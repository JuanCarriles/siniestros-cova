import test from 'node:test'
import assert from 'node:assert/strict'
import { conBaseTemporal } from './fixtures/base-temporal.mjs'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import { crearEnvioInforme } from '../src/modules/informes/informes.envio.ts'
import { crearServicioInformes } from '../src/modules/informes/informes.service.ts'
import { cargarRegistrosInforme } from '../src/modules/informes/informes.registros.ts'
import { calcularInforme } from '../src/modules/informes/informes.calculos.ts'

test(
  'Correcciones mensuales: destinatarios, concurrencia, cola y contexto estadístico',
  { timeout: 120000 },
  async (t) => {
    await conBaseTemporal('informes_correcciones', async () => {
      const db = getPrisma()
      try {
        let reloj = new Date('2027-04-02T12:00:00Z')
        const usuario = (nombre, eliminado = false) =>
          db.usuario.create({
            data: {
              nombres: nombre,
              apellidos: 'Prueba',
              documento: '0',
              telefono: '0',
              email: `${nombre}@example.invalid`,
              contrasena: '-',
              tipoUsuario: 'SUPER_ADMINISTRADOR',
              eliminado,
              fechaBaja: eliminado ? new Date() : null,
              direccion: { create: {} },
            },
          })
        const a = await usuario('primero'),
          b = await usuario('segundo'),
          inactivo = await usuario('inactivo', true)
        const informe = await db.informeMensual.create({
          data: {
            clavePeriodo: 'prueba:envios',
            periodo: '2027-03',
            prueba: true,
            estado: 'LISTO',
            clavePdf: 'prueba.pdf',
          },
        })
        const llamadas = [],
          claves = new Map()
        let falla = true
        const enviar = crearEnvioInforme(
          {
            db: () => db,
            almacenamiento: () => ({ leerInforme: async () => Buffer.from('PDF') }),
            enviar: async (email, periodo, pdf, clave) => {
              llamadas.push(email)
              if (claves.has(email)) assert.equal(claves.get(email), clave)
              claves.set(email, clave)
              if (email === b.email && falla) throw Error('fallo simulado')
            },
          },
          () => reloj,
        )
        await t.test(
          'Guarda cada entrega y reintenta solo destinatarios activos pendientes',
          async () => {
            await assert.rejects(enviar(informe.id), (e) => e.status === 502)
            let guardado = await db.informeMensual.findUniqueOrThrow({
              where: { id: informe.id },
              include: { envios: true },
            })
            assert.deepEqual(
              guardado.envios.map((e) => e.email),
              [a.email],
            )
            assert.equal(guardado.correoEnviado, null)
            assert.equal(guardado.proximoIntento.toISOString(), '2027-04-02T13:00:00.000Z')
            falla = false
            await db.usuario.update({
              where: { id: b.id },
              data: { eliminado: true, fechaBaja: new Date() },
            })
            const c = await usuario('tercero')
            await enviar(informe.id)
            await enviar(informe.id)
            guardado = await db.informeMensual.findUniqueOrThrow({
              where: { id: informe.id },
              include: { envios: true },
            })
            assert.ok(guardado.correoEnviado)
            assert.equal(guardado.proximoIntento, null)
            assert.deepEqual(guardado.envios.map((e) => e.email).sort(), [a.email, c.email].sort())
            assert.deepEqual(llamadas, [a.email, b.email, c.email])
            assert.ok(!llamadas.includes(inactivo.email))
            assert.notEqual(claves.get(a.email), claves.get(c.email))
          },
        )
        await t.test(
          'Dos envíos simultáneos no duplican entregas; idempotencia estable tras fallo',
          async () => {
            const i = await db.informeMensual.create({
              data: {
                clavePeriodo: 'prueba:concurrente',
                periodo: '2027-03',
                prueba: true,
                estado: 'LISTO',
                clavePdf: 'prueba.pdf',
              },
            })
            const entradas = []
            let liberar, avisar
            const pausa = new Promise((resolve) => {
                liberar = resolve
              }),
              iniciado = new Promise((resolve) => {
                avisar = resolve
              })
            const send = crearEnvioInforme(
              {
                db: () => db,
                almacenamiento: () => ({ leerInforme: async () => Buffer.from('PDF') }),
                enviar: async (email) => {
                  entradas.push(email)
                  avisar()
                  await pausa
                },
              },
              () => reloj,
            )
            const primero = send(i.id)
            await iniciado
            await assert.rejects(send(i.id), (e) => e.status === 409)
            liberar()
            await primero
            assert.equal(new Set(entradas).size, entradas.length)
            const retry = await db.informeMensual.create({
              data: {
                clavePeriodo: 'prueba:retry',
                periodo: '2027-03',
                prueba: true,
                estado: 'LISTO',
                clavePdf: 'prueba.pdf',
              },
            })
            const keys = []
            let fallar = true
            const conFallo = crearEnvioInforme(
              {
                db: () => db,
                almacenamiento: () => ({ leerInforme: async () => Buffer.from('PDF') }),
                enviar: async (email, p, pdf, key) => {
                  if (email !== a.email) return
                  keys.push(key)
                  if (fallar) throw Error('simulado')
                },
              },
              () => reloj,
            )
            await assert.rejects(conFallo(retry.id), (e) => e.status === 502)
            fallar = false
            await conFallo(retry.id)
            assert.equal(keys.length, 2)
            assert.equal(keys[0], keys[1])
          },
        )
        await t.test(
          'Fallo de generación: espera 1 h, luego 6 h, y deja avanzar otros meses',
          async () => {
            await db.registroEstadisticoSiniestro.updateMany({
              where: { evento: 'INICIO' },
              data: { fechaRegistro: new Date('2027-01-01T03:00:00Z') },
            })
            let subidas = 0
            const service = crearServicioInformes({
              db: () => db,
              pruebasHabilitadas: false,
              reloj: () => reloj,
              almacenamiento: () => ({
                subirInforme: async () => {
                  subidas++
                  throw Error('R2 simulado')
                },
                eliminar: async () => {},
              }),
              enviar: async () => {},
            })
            await assert.rejects(service.revisarPendientes())
            let enero = await db.informeMensual.findUniqueOrThrow({
              where: { clavePeriodo: '2027-01' },
            })
            assert.equal(enero.estado, 'ERROR')
            assert.equal(enero.intentosFallidos, 1)
            assert.equal(enero.proximoIntento.toISOString(), '2027-04-02T13:00:00.000Z')
            reloj = new Date('2027-04-02T12:15:00Z')
            await assert.rejects(service.revisarPendientes())
            assert.ok(await db.informeMensual.findUnique({ where: { clavePeriodo: '2027-02' } }))
            assert.equal(subidas, 2)
            reloj = new Date('2027-04-02T13:00:00Z')
            await assert.rejects(service.revisarPendientes())
            enero = await db.informeMensual.findUniqueOrThrow({
              where: { clavePeriodo: '2027-01' },
            })
            assert.equal(enero.intentosFallidos, 2)
            assert.equal(enero.proximoIntento.toISOString(), '2027-04-02T19:00:00.000Z')
          },
        )
        await t.test(
          'Un fallo de correo no regenera el PDF y deja avanzar el mes siguiente',
          async () => {
            await db.informeMensual.deleteMany({ where: { prueba: false } })
            reloj = new Date('2027-04-02T12:00:00Z')
            let subidas = 0
            const auto = crearServicioInformes({
              db: () => db,
              pruebasHabilitadas: false,
              reloj: () => reloj,
              almacenamiento: () => ({
                subirInforme: async () => {
                  subidas++
                },
                leerInforme: async () => Buffer.from('pdf'),
                eliminar: async () => {},
              }),
              enviar: async () => {
                throw Error('Resend simulado')
              },
            })
            await assert.rejects(auto.revisarPendientes(), (e) => e.status === 502)
            const enero = await db.informeMensual.findUniqueOrThrow({
              where: { clavePeriodo: '2027-01' },
            })
            assert.equal(enero.estado, 'LISTO')
            assert.equal(enero.correoEnviado, null)
            assert.equal(enero.proximoIntento.toISOString(), '2027-04-02T13:00:00.000Z')
            reloj = new Date('2027-04-02T12:15:00Z')
            await assert.rejects(auto.revisarPendientes(), (e) => e.status === 502)
            assert.equal(subidas, 2)
            assert.ok(await db.informeMensual.findUnique({ where: { clavePeriodo: '2027-02' } }))
            reloj = new Date('2027-04-02T13:00:00Z')
            await assert.rejects(auto.revisarPendientes(), (e) => e.status === 502)
            assert.equal(subidas, 2)
            assert.equal(
              (
                await db.informeMensual.findUniqueOrThrow({ where: { id: enero.id } })
              ).proximoIntento.toISOString(),
              '2027-04-02T19:00:00.000Z',
            )
          },
        )
        await t.test(
          'Consulta compacta conserva todos los indicadores y la primera respuesta histórica',
          async () => {
            const foto = (id) => ({
              id,
              numero: 'S-' + id,
              ingreso: '2026-08-01T12:00:00Z',
              ocurrencia: '2026-08-01',
              estado: { id: 1, nombre: 'Tratamiento', cierre: false },
              aseguradora: { id: 1, nombre: 'A' },
              ajustador: null,
              gestor: { id: 1, nombre: 'Gestor', tipo: 'GESTOR' },
              eliminado: false,
              fechaCierre: null,
              ultimoMovimiento: '2026-09-20T12:00:00Z',
              menores: false,
              moneda: 'ARS',
              reclamado: '100',
              acordado: null,
              resultado: null,
              personas: [],
              pericias: [],
            })
            const rows = []
            const add = (id, fecha, evento, datos) =>
              rows.push({
                idSiniestro: id,
                fechaRegistro: new Date(fecha),
                fechaEvento: new Date(fecha),
                evento,
                datos,
              })
            for (const id of [100, 101]) {
              const f = foto(id)
              add(id, '2026-08-01T12:00:00Z', 'ALTA', structuredClone(f))
              f.gestor = { id: 2, nombre: 'Otro gestor', tipo: 'GESTOR' }
              add(id, '2026-09-01T12:00:00Z', 'DATOS', structuredClone(f))
              if (id === 100) add(id, '2026-09-02T12:00:00Z', 'NOVEDAD', structuredClone(f))
              for (let d = 3; d < 28; d++)
                add(
                  id,
                  `2026-09-${String(d).padStart(2, '0')}T12:00:00Z`,
                  'DATOS',
                  structuredClone(f),
                )
              add(id, '2026-10-02T12:00:00Z', 'NOVEDAD', structuredClone(f))
              add(id, '2026-10-05T12:00:00Z', 'NOVEDAD', structuredClone(f))
            }
            // Las instantáneas no comparten referencias mutables.
            await db.registroEstadisticoSiniestro.createMany({ data: rows })
            const ahora = new Date('2026-11-01T12:00:00Z')
            const todos = await db.registroEstadisticoSiniestro.findMany({
              where: { fechaRegistro: { lt: ahora } },
              orderBy: [{ fechaRegistro: 'asc' }, { id: 'asc' }],
            })
            const compactos = await db.$transaction(
              (tx) => cargarRegistrosInforme(tx, '2026-10', ahora),
              { isolationLevel: 'RepeatableRead' },
            )
            assert.ok(compactos.registros.length < todos.length / 2)
            const normalizar = (v) =>
              Array.isArray(v)
                ? v
                    .map(normalizar)
                    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
                : v && typeof v === 'object'
                  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalizar(x)]))
                  : v
            assert.deepEqual(
              normalizar(
                calcularInforme('2026-10', compactos.registros, ahora, compactos.contexto),
              ),
              normalizar(calcularInforme('2026-10', todos, ahora)),
            )
            assert.equal(compactos.contexto.asignaciones.get(100).respondida, true)
            assert.equal(compactos.contexto.asignaciones.get(101).respondida, false)
          },
        )
      } finally {
        await disconnectPrisma()
      }
    })
  },
)
