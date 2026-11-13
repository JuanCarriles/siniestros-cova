import test from 'node:test'
import assert from 'node:assert/strict'
import { conBaseTemporal } from './fixtures/base-temporal.mjs'
import { getPrisma, disconnectPrisma } from '../src/lib/prisma.ts'
import {
  columnasFotoSiniestro,
  columnasTecnicasSiniestro,
  verificarColumnasEstadisticas,
} from './fixtures/estadistica-siniestro.mjs'

test(
  'Contrato de triggers y columnas estadísticas tras aplicar toda la cadena de migraciones',
  { timeout: 90000 },
  async (t) => {
    assert.notEqual(process.env.NODE_ENV, 'production')
    await conBaseTemporal('triggers_estadistica', async () => {
      const db = getPrisma()
      try {
        const columnas = async () =>
          (
            await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Siniestro'`
          ).map((c) => c.column_name)
        await t.test(
          'Toda columna del esquema tiene una decisión; una nueva columna hace fallar la comprobación',
          async () => {
            verificarColumnasEstadisticas(await columnas())
            await db.$transaction(async (tx) => {
              await tx.$executeRaw`ALTER TABLE "Siniestro" ADD COLUMN "sinDecisionEstadistica" TEXT`
              const nuevas =
                await tx.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Siniestro'`
              assert.throws(
                () => verificarColumnasEstadisticas(nuevas.map((c) => c.column_name)),
                /decidir si cada columna/,
              )
              // La prueba vive en una base temporal; quitar solo la columna creada por ella.
              await tx.$executeRaw`ALTER TABLE "Siniestro" DROP COLUMN "sinDecisionEstadistica"`
            })
          },
        )
        await t.test(
          'El inventario incluye todos los triggers de aplicación y su función',
          async () => {
            const triggers =
              await db.$queryRaw`SELECT c.relname AS tabla,t.tgname AS nombre,p.proname AS funcion
          FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal AND n.nspname='public'`
            const esperado = [
              [
                'Notificacion',
                'notificacion_cambio_tiempo_real',
                'cova_avisar_cambio_notificacion',
              ],
              [
                'HistorialSiniestro',
                'historial_autor_al_registrar',
                'historial_autor_al_registrar',
              ],
              [
                'HistorialSiniestro',
                'actividad_siniestro_al_registrar',
                'actividad_siniestro_al_registrar',
              ],
              ['Siniestro', 'estadistica_caso', 'cova_estadistica_caso'],
              ['Siniestro', 'estadistica_borrado', 'cova_estadistica_caso'],
              ['Perito', 'estadistica_perito', 'cova_estadistica_parte'],
              ['PersonaInvolucrada', 'estadistica_persona', 'cova_estadistica_parte'],
              ['Vehiculo', 'estadistica_vehiculo', 'cova_estadistica_parte'],
              ['Abogado', 'estadistica_abogado', 'cova_estadistica_abogado'],
              ['HistorialSiniestro', 'estadistica_historial', 'cova_estadistica_evento'],
              ['DocumentoSiniestro', 'estadistica_documento', 'cova_estadistica_evento'],
              ['NovedadSiniestro', 'estadistica_novedad', 'cova_estadistica_evento'],
            ]
            assert.deepEqual(
              triggers.map((t) => [t.tabla, t.nombre, t.funcion].join('/')).sort(),
              esperado.map((t) => t.join('/')).sort(),
              'Cambió el inventario: revisar docs/TRIGGERS.md y el efecto en historial, dashboard e informes',
            )
          },
        )
        const usuario = await db.usuario.create({
          data: {
            nombres: 'Prueba',
            apellidos: 'Estadística',
            email: 'estadistica@example.invalid',
            documento: '0',
            telefono: '0',
            contrasena: '-',
            tipoUsuario: 'ADMINISTRADOR',
            direccion: { create: {} },
          },
        })
        const estado = await db.estadoSiniestro.create({
          data: { nombre: 'Abierto', descripcion: 'Prueba' },
        })
        const aseguradora = await db.aseguradora.create({ data: { nombre: 'Prueba estadística' } })
        const caso = await db.siniestro.create({
          data: {
            numeroSiniestro: 'CONTRATO-1',
            numeroPoliza: 'POL-1',
            fechaAsignacion: new Date(),
            menorEdadInvolucrado: false,
            idUsuario: usuario.id,
            idEstadoSiniestro: estado.id,
            idAseguradora: aseguradora.id,
          },
        })
        await t.test(
          'La instantánea tiene los datos aprobados y los campos técnicos no generan actividad',
          async () => {
            const [{ foto }] =
              await db.$queryRaw`SELECT cova_datos_estadisticos(${caso.id}::integer) AS foto`
            for (const ruta of Object.values(columnasFotoSiniestro)) {
              let valor = foto
              for (const segmento of ruta.split('.')) {
                assert.ok(valor && Object.hasOwn(valor, segmento), `La foto debe conservar ${ruta}`)
                valor = valor[segmento]
              }
            }
            const contar = () =>
              db.registroEstadisticoSiniestro.count({ where: { idSiniestro: caso.id } })
            const antes = await contar()
            await db.siniestro.update({
              where: { id: caso.id },
              data: {
                revision: { increment: 1 },
                eliminacionEnCurso: true,
                carpetaR2: 'siniestros/CONTRATO-1/POL-1',
              },
            })
            assert.equal(
              await contar(),
              antes,
              'Actualizar solo campos técnicos no debe registrar DATOS',
            )
            for (const columna of Object.keys(columnasTecnicasSiniestro))
              assert.ok(!Object.hasOwn(foto, columna))
            await db.siniestro.update({
              where: { id: caso.id },
              data: { causa: 'Texto que no debe duplicarse' },
            })
            assert.equal(await contar(), antes + 1, 'Un cambio de negocio conserva su evento DATOS')
            const ultimo = await db.registroEstadisticoSiniestro.findFirst({
              where: { idSiniestro: caso.id },
              orderBy: { id: 'desc' },
            })
            assert.equal(ultimo.evento, 'DATOS')
            assert.ok(!Object.hasOwn(ultimo.datos, 'causa'))
            assert.ok(!Object.hasOwn(ultimo.datos, 'idDireccion'))
          },
        )
      } finally {
        await disconnectPrisma()
      }
    })
  },
)
