// Seed de VOLUMEN, solo para desarrollo: agrega muchos siniestros ficticios para probar el listado con
// paginación, filtros, búsqueda y orden (E4-01). Va después de la seed de desarrollo (usa sus usuarios,
// aseguradoras, ajustadores y abogados).
//   npm run seed:volumen -w backend            (150 siniestros)
//   npm run seed:volumen -w backend -- 400     (otra cantidad)
//
// Solo carga lo que muestra el listado (partes, peritos, abogados, fechas). Sin historial, novedades,
// documentos ni chat: esos casos se ven completos en los 6 siniestros de la seed de desarrollo.
// Se puede correr una sola vez; para quitarlos: npm run db:reset:dev -w backend.
import {
  RolAccidente,
  TipoLesion,
  TipoPerito,
  UsoVehiculo,
  type Prisma,
} from '../../src/generated/prisma/client.ts'
import { disconnectPrisma, getPrisma } from '../../src/lib/prisma.ts'

const MARCA = 'Carga de volumen (prueba)'
const DIA_MS = 24 * 60 * 60 * 1000

// Con tildes a propósito: la búsqueda tiene que encontrar "Gomez" en "Gómez"
const NOMBRES = [
  'María',
  'José',
  'Lucía',
  'Martín',
  'Sofía',
  'Joaquín',
  'Inés',
  'Ramón',
  'Julieta',
  'Tomás',
  'Camila',
  'Agustín',
  'Valentina',
  'Nicolás',
  'Florencia',
  'Matías',
]
const APELLIDOS = [
  'Gómez',
  'Pérez',
  'Fernández',
  'Ríos',
  'Sánchez',
  'Peña',
  'Domínguez',
  'Ibáñez',
  'Acuña',
  'Muñoz',
  'Giménez',
  'Benítez',
  'Ortiz',
  'Córdoba',
  'Suárez',
  'Álvarez',
]
const EMPRESAS = [
  'Transportes del Sur S.A.',
  'Logística Rosario S.R.L.',
  'Kiosco El Puente',
  'Distribuidora Paraná S.A.',
]
const VEHICULOS = [
  ['Toyota', 'Corolla'],
  ['Volkswagen', 'Gol Trend'],
  ['Fiat', 'Cronos'],
  ['Renault', 'Kangoo'],
  ['Ford', 'Ranger'],
  ['Chevrolet', 'Onix'],
  ['Peugeot', '208'],
] as const
const ROLES_SIN_VEHICULO = ['Peatón', 'Testigo', 'Dueño de propiedad']
const PERITOS = {
  CESVI: ['Ing. Federico Lagos', 'Ing. Carla Montes'],
  MEDICO: ['Dra. Inés Carrizo', 'Dr. Pablo Ruiz Díaz'],
}

// Generador con semilla: la misma cantidad siempre produce los mismos datos
let semilla = 20261020
function azar() {
  semilla = (semilla * 1103515245 + 12345) % 2147483648
  return semilla / 2147483648
}
const entero = (min: number, max: number) => min + Math.floor(azar() * (max - min + 1))
const elegir = <T>(lista: readonly T[]): T => lista[entero(0, lista.length - 1)] as T
const persona = () => `${elegir(NOMBRES)} ${elegir(APELLIDOS)}`
const patente = () =>
  `${String.fromCharCode(65 + entero(0, 25))}${String.fromCharCode(65 + entero(0, 25))}${entero(100, 999)}${String.fromCharCode(65 + entero(0, 25))}${String.fromCharCode(65 + entero(0, 25))}`

try {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('La seed de volumen no puede correr con NODE_ENV=production.')
  }
  const cantidad = Number(process.argv[2] ?? 150)
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 5000) {
    throw new Error('Indicá una cantidad entre 1 y 5000.')
  }

  const prisma = getPrisma()
  if (await prisma.siniestro.count({ where: { sucursal: MARCA } })) {
    console.log(
      'La carga de volumen ya estaba hecha. Para repetirla: npm run db:reset:dev -w backend',
    )
  } else {
    const [usuarios, aseguradoras, abogados, estados] = await Promise.all([
      prisma.usuario.findMany({
        where: { eliminado: false },
        select: { id: true, tipoUsuario: true },
      }),
      prisma.aseguradora.findMany({
        where: { eliminado: false, ajustadores: { some: { eliminado: false } } },
        select: { id: true, ajustadores: { where: { eliminado: false }, select: { id: true } } },
      }),
      prisma.abogado.findMany({ where: { eliminado: false }, select: { id: true } }),
      prisma.estadoSiniestro.findMany({
        where: { eliminado: false },
        select: { id: true, esCierre: true },
      }),
    ])
    if (!usuarios.length || !aseguradoras.length || !estados.length) {
      throw new Error('Primero corré la seed de desarrollo: npm run seed:dev -w backend')
    }
    // La mayoría de los casos los llevan los gestores
    const asignables = usuarios.flatMap((u) =>
      u.tipoUsuario === 'GESTOR' ? [u.id, u.id, u.id] : [u.id],
    )
    const ahora = Date.now()
    const hace = (dias: number) => new Date(ahora - dias * DIA_MS - entero(0, 8) * 3600_000)

    await prisma.$transaction(
      async (tx) => {
        for (let i = 0; i < cantidad; i++) {
          const aseguradora = elegir(aseguradoras)
          const estado = elegir(estados)
          const asignadoHace = entero(1, 240)
          const sinMovimiento = Math.min(asignadoHace, entero(0, 1) ? entero(0, 2) : entero(3, 25))
          const siniestro = await tx.siniestro.create({
            data: {
              numeroSiniestro: `2025-${String(10000 + i).padStart(5, '0')}`,
              numeroPoliza: `${String(entero(1, 9)).padStart(2, '0')}-${entero(100000, 999999)}`,
              sucursal: MARCA,
              fechaAsignacion: hace(asignadoHace),
              fechaUltimoMovimiento: hace(sinMovimiento),
              fechaCierre: estado.esCierre ? hace(sinMovimiento) : null,
              demorado: !estado.esCierre && sinMovimiento >= 3,
              menorEdadInvolucrado: entero(0, 9) === 0,
              idEstadoSiniestro: estado.id,
              idAseguradora: aseguradora.id,
              idAjustador: elegir(aseguradora.ajustadores).id,
              idUsuario: elegir(asignables),
              // Unos pocos dados de baja, para "Mostrar dados de baja"
              ...(entero(0, 24) === 0 ? { eliminado: true, fechaBaja: hace(entero(0, 30)) } : {}),
            },
          })
          const vehiculo = async (rol: RolAccidente) => {
            const [marca, modelo] = elegir(VEHICULOS)
            return tx.vehiculo.create({
              data: {
                dominio: patente(),
                marca,
                modelo,
                anio: entero(2008, 2025),
                rolAccidente: rol,
                uso: UsoVehiculo.PARTICULAR,
              },
            })
          }
          const abogado = () => (abogados.length && entero(0, 3) === 0 ? elegir(abogados).id : null)
          const lesion = () =>
            entero(0, 3) === 0
              ? elegir([TipoLesion.LEVE, TipoLesion.MODERADA, TipoLesion.GRAVE])
              : null
          const crearPersona = (
            data: Omit<Prisma.PersonaInvolucradaUncheckedCreateInput, 'idSiniestro'>,
          ) =>
            tx.personaInvolucrada.create({
              data: {
                idSiniestro: siniestro.id,
                documento: String(entero(20, 45) * 1_000_000 + entero(0, 999_999)),
                telefono: `11 ${entero(4000, 6999)}-${entero(1000, 9999)}`,
                ...data,
              },
            })

          // Casi siempre hay vehículo asegurado con su titular
          if (entero(0, 9) > 0) {
            const asegurado = await vehiculo(RolAccidente.ASEGURADO)
            await crearPersona({
              nombreCompletoRazonSocial: persona(),
              idVehiculo: asegurado.id,
              esPropietario: true,
              esOcupante: true,
              rolEnVehiculo: 'Conductor/a',
            })
          }
          // Terceros: de 0 a 4, en otro vehículo o fuera de los vehículos
          const terceros = entero(0, 4)
          const otro =
            terceros > 0 && entero(0, 2) > 0 ? await vehiculo(RolAccidente.TERCERO) : null
          for (let t = 0; t < terceros; t++) {
            const enVehiculo = otro !== null && t < 2
            await crearPersona({
              nombreCompletoRazonSocial: entero(0, 7) === 0 ? elegir(EMPRESAS) : persona(),
              idVehiculo: enVehiculo ? otro.id : null,
              esPropietario: enVehiculo ? t === 0 : null,
              esOcupante: enVehiculo ? true : null,
              rolEnVehiculo: enVehiculo ? (t === 0 ? 'Conductor/a' : 'Acompañante') : null,
              rolSinVehiculo: enVehiculo ? null : elegir(ROLES_SIN_VEHICULO),
              idAbogado: abogado(),
              tipoLesion: lesion(),
            })
          }
          for (const tipo of [TipoPerito.CESVI, TipoPerito.MEDICO]) {
            if (entero(0, 2) > 0) continue
            const cerrado = entero(0, 1) === 1
            await tx.perito.create({
              data: {
                idSiniestro: siniestro.id,
                tipoPerito: tipo,
                nombre: elegir(PERITOS[tipo]),
                telefono: `11 ${entero(4000, 6999)}-${entero(1000, 9999)}`,
                fechaSolicitud: hace(Math.max(sinMovimiento, entero(sinMovimiento, asignadoHace))),
                cerrado,
                fechaCierre: cerrado ? hace(sinMovimiento) : null,
              },
            })
          }
        }
      },
      { timeout: 300_000 },
    )
    console.log(`Se agregaron ${cantidad} siniestros de prueba (sucursal "${MARCA}").`)
  }
} catch (err) {
  console.error('La seed de volumen falló; no se guardó ningún cambio.\n', err)
  process.exitCode = 1
} finally {
  await disconnectPrisma()
}
