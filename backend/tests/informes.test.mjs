import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularInforme,
  limitesMes,
  mesAnterior,
  mesArgentina,
} from '../src/modules/informes/informes.calculos.ts'
import {
  importeSchema,
  cierreInformeSchema,
  generarInformeSchema,
} from '@cova/shared/schemas/informes'

const foto = (id, otros = {}) => ({
  id,
  numero: 'S-' + id,
  ingreso: '2026-10-02T12:00:00Z',
  ocurrencia: '2026-10-01',
  estado: { id: 1, nombre: 'Tratamiento', cierre: false },
  aseguradora: { id: 1, nombre: 'Aseguradora' },
  ajustador: null,
  gestor: { id: 1, nombre: 'Gestor A', tipo: 'GESTOR' },
  eliminado: false,
  fechaCierre: null,
  ultimoMovimiento: '2026-10-02T12:00:00Z',
  menores: false,
  moneda: 'ARS',
  reclamado: '100.10',
  acordado: null,
  resultado: null,
  personas: [],
  pericias: [],
  ...otros,
})
const registro = (id, fecha, datos, evento = 'DATOS', idAutor = null) => ({
  id: BigInt(id),
  idSiniestro: datos?.id ?? 0,
  fechaRegistro: new Date(fecha),
  fechaEvento: new Date(fecha),
  evento,
  idAutor,
  datos: datos ?? {},
})
const inicio = registro(1, '2026-09-01T00:00:00Z', null, 'INICIO')
const ahora = new Date('2026-11-01T10:00:00Z')
test('Meses y cortes usan medianoche de Argentina y soportan cambio de año', () => {
  assert.equal(limitesMes('2026-10').inicio.toISOString(), '2026-10-01T03:00:00.000Z')
  assert.equal(limitesMes('2026-10').fin.toISOString(), '2026-11-01T03:00:00.000Z')
  assert.equal(mesAnterior('2026-01'), '2025-12')
  assert.equal(mesArgentina(new Date('2026-11-01T02:59:59Z')), '2026-10')
})
test('Importes exactos, moneda separada y cierre con acuerdo exige monto explícito', () => {
  assert.equal(importeSchema.parse('123,45'), '123.45')
  assert.equal(importeSchema.safeParse('-1').success, false)
  assert.equal(importeSchema.safeParse('0.001').success, false)
  assert.equal(importeSchema.safeParse('1e10').success, false)
  assert.equal(cierreInformeSchema.safeParse({ resultadoCierre: 'ACUERDO_PAGO' }).success, false)
  assert.equal(
    cierreInformeSchema.parse({ resultadoCierre: 'ACUERDO_PAGO', montoAcordado: '0' })
      .montoAcordado,
    '0',
  )
  assert.equal(generarInformeSchema.safeParse({ periodo: '2026-13' }).success, false)
})
test('Cuenta una vez el cierre; reapertura no borra el cierre ni su responsable; no usa el futuro', () => {
  const a = foto(1),
    c = {
      ...a,
      estado: { id: 2, nombre: 'Cierre enviado', cierre: true },
      fechaCierre: '2026-10-20T12:00:00Z',
      acordado: '60.05',
      resultado: 'ACUERDO_PAGO',
    }
  const registros = [
    inicio,
    registro(2, '2026-10-02T12:00:00Z', a, 'ALTA'),
    registro(3, '2026-10-20T12:00:00Z', c),
    registro(4, '2026-10-20T12:00:01Z', c, 'CAMBIO_ESTADO', 2),
    registro(5, '2026-10-22T12:00:00Z', { ...a, fechaCierre: null }),
    registro(6, '2026-11-02T12:00:00Z', { ...a, eliminado: true }),
  ]
  const r = calcularInforme('2026-10', registros, ahora)
  assert.equal(r.nuevos, 1)
  assert.equal(r.cerrados, 1)
  assert.equal(r.abiertos, 1)
  assert.equal(r.enMediacion, r.abiertos)
  assert.equal(r.reaperturas, 1)
  assert.equal(r.economia[0].reclamado, '100.10')
  assert.equal(r.economia[0].acordado, '60.05')
  assert.equal(r.economia[0].diferencia, '40.05')
})
test('Bajas y borrado definitivo mantienen el movimiento del período; todos los datos al corte', () => {
  const a = foto(1, { ingreso: '2026-09-02T12:00:00Z' }),
    b = foto(2)
  const r = calcularInforme(
    '2026-10',
    [
      inicio,
      registro(2, '2026-09-02T12:00:00Z', a, 'ALTA'),
      registro(3, '2026-10-02T12:00:00Z', b, 'ALTA'),
      registro(4, '2026-10-10T12:00:00Z', { ...a, eliminado: true }, 'ELIMINACION'),
    ],
    ahora,
  )
  assert.equal(r.iniciales, 1)
  assert.equal(r.administrados, 2)
  assert.equal(r.abiertos, 1)
  assert.equal(r.bajas, 1)
})
test('Semáforo, lesiones, abogados, menores, pericias y actividad por autor', () => {
  const a = foto(1, {
    menores: true,
    personas: [
      { id: 1, lesion: 'LEVE', tercero: true, abogado: true },
      { id: 2, lesion: 'GRAVE', tercero: false, abogado: false },
    ],
    pericias: [
      { id: 1, tipo: 'MEDICO', solicitud: '2026-09-10T12:00:00Z', cierre: null, eliminado: false },
    ],
  })
  const r = calcularInforme(
    '2026-10',
    [
      inicio,
      registro(2, '2026-10-02T12:00:00Z', a, 'ALTA'),
      registro(3, '2026-10-03T12:00:00Z', { ...a, autorNombre: 'Administradora' }, 'NOVEDAD', 99),
    ],
    ahora,
  )
  assert.equal(r.demorados.rojos, 1)
  assert.equal(r.menores, 1)
  assert.equal(r.lesiones.find((l) => l.tipo === 'GRAVE').casos, 1)
  assert.equal(r.conAbogado, 1)
  assert.equal(r.pericias[1].pendientes, 1)
  assert.equal(r.pericias[1].mayores30.length, 1)
  assert.equal(r.actividad[0].nombre, 'Administradora')
})
test('La cobertura parcial no inventa el saldo inicial; el mes actual es provisional', () => {
  const r = calcularInforme(
    '2026-10',
    [registro(1, '2026-10-15T12:00:00Z', null, 'INICIO')],
    new Date('2026-10-20T12:00:00Z'),
  )
  assert.equal(r.completa, false)
  assert.equal(r.iniciales, null)
  assert.equal(r.provisional, true)
})

test('El tiempo de estado no se divide por cada documento; una pericia reabierta conserva su cierre del mes', () => {
  const a = foto(1, {
    ingreso: '2026-09-02T12:00:00Z',
    pericias: [
      { id: 1, tipo: 'CESVI', solicitud: '2026-09-10T12:00:00Z', cierre: null, eliminado: false },
    ],
  })
  const c = { ...a, pericias: [{ ...a.pericias[0], cierre: '2026-10-10T12:00:00Z' }] }
  const r = calcularInforme(
    '2026-10',
    [
      inicio,
      registro(2, '2026-09-02T12:00:00Z', a, 'ALTA'),
      registro(3, '2026-10-10T12:00:00Z', c),
      registro(4, '2026-10-11T12:00:00Z', c, 'DOCUMENTO', 1),
      registro(5, '2026-10-20T12:00:00Z', a),
    ],
    ahora,
  )
  assert.equal(r.tiemposEstado[0].promedio, 31)
  assert.equal(r.pericias[0].finalizadas, 1)
  assert.equal(r.pericias[0].pendientes, 1)
})
test('Una línea base no cuenta como nueva asignación ni nuevo abogado del mes', () => {
  const a = foto(1, {
    ingreso: '2026-09-02T12:00:00Z',
    personas: [{ id: 1, lesion: null, tercero: true, abogado: true }],
  })
  const r = calcularInforme(
    '2026-10',
    [
      registro(1, '2026-10-15T12:00:00Z', null, 'INICIO'),
      registro(2, '2026-10-15T12:00:00Z', a, 'BASELINE'),
    ],
    ahora,
  )
  assert.equal(r.gestores[0].asignados, 0)
  assert.equal(r.nuevosConAbogado, 0)
})
