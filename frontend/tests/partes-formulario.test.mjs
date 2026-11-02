import assert from 'node:assert/strict'
import test from 'node:test'
import {
  abogadoAltaSchema,
  ocupanteAltaSchema,
  peritoAltaSchema,
  personaExternaAltaSchema,
  titularAltaSchema,
  vehiculoAltaSchema,
} from '../../shared/src/schemas/siniestros-alta.ts'
import { gruposRepresentables } from '../src/features/siniestros/abogados-alta.ts'
import {
  abogadoAFormulario,
  externaAFormulario,
  idDePersona,
  ocupanteAFormulario,
  peritoAFormulario,
  personasDelSiniestro,
  representablesDeFicha,
  representantesDeFicha,
  titularAFormulario,
  vehiculoAFormulario,
} from '../src/features/siniestros/ficha/partes-formulario.ts'
import { documentoRepetido, nombresPersonas } from '../src/features/siniestros/personas-alta.ts'

// Ficha del siniestro (E5-06): modificar un vehículo o una persona abre el formulario del alta con lo guardado

/** La clave solo identifica a la persona en la pantalla: el formulario no la manda */
const sinClave = ({ clave: _clave, ...datos }) => datos
const errores = (resultado) =>
  resultado.error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`) ?? []
const persona = {
  nombre: 'Norma Quiroga',
  idTipoDocumento: 1,
  tipoDocumento: 'DNI',
  documento: '27.884.102',
  estadoCivil: 'Viuda',
  sexo: 'Femenino',
  fechaNacimiento: '1958-11-20',
  telefono: '341 555-1002',
  email: null,
  domicilio: {
    pais: 'Argentina',
    idProvincia: 21,
    provincia: 'Santa Fe',
    localidad: 'Rosario',
    calle: 'Belgrano 455',
    codigoPostal: null,
  },
  lesion: null,
  abogado: null,
}
const enVehiculo = {
  ibaEnVehiculo: true,
  lugarEnVehiculo: 'Conductor/a',
  numeroPermisoConducir: null,
  fechaVencimientoCarnet: null,
  relacionTitular: null,
}
const vehiculo = {
  id: 7,
  rolAccidente: 'TERCERO',
  marca: 'Volkswagen',
  modelo: 'Gol Trend',
  version: null,
  dominio: 'AA456EF',
  anio: 2016,
  uso: 'PARTICULAR',
  tipo: null,
  color: null,
  numeroChasis: null,
  numeroMotor: null,
  idAseguradora: 3,
  aseguradora: 'Sancor',
  acreedorPrendario: null,
  descripcionDanos: 'Puerta trasera',
  titular: { id: 11, ...persona, ...enVehiculo },
  ocupantes: [
    {
      id: 12,
      ...persona,
      nombre: null,
      documento: null,
      ...enVehiculo,
      lugarEnVehiculo: 'en la caja',
      lesion: { tipo: 'LEVE', descripcion: 'Golpe' },
    },
  ],
}

test('lo que muestra la ficha precarga el formulario y el schema del alta lo acepta tal cual', () => {
  assert.deepEqual(
    vehiculoAltaSchema.parse(vehiculoAFormulario(vehiculo)),
    vehiculoAltaSchema.parse(vehiculoAFormulario(vehiculo)),
  )
  assert.equal(vehiculoAltaSchema.parse(vehiculoAFormulario(vehiculo)).idAseguradora, 3)

  const titular = titularAFormulario(vehiculo.titular)
  assert.equal(titular.clave, 'p11')
  assert.equal(titular.lugar, 'Conductor/a')
  assert.equal(titular.domicilio.idProvincia, 21)
  assert.deepEqual(errores(titularAltaSchema.safeParse(sinClave(titular))), [])

  // Un lugar que no está en la lista se guardó escrito a mano: vuelve como "Otro"
  const ocupante = ocupanteAFormulario(vehiculo.ocupantes[0])
  assert.deepEqual([ocupante.lugar, ocupante.lugarOtro], ['Otro', 'en la caja'])
  assert.deepEqual([ocupante.conLesiones, ocupante.tipoLesion], [true, 'LEVE'])
  assert.deepEqual(errores(ocupanteAltaSchema.safeParse(sinClave(ocupante))), [])

  const testigo = externaAFormulario({
    id: 13,
    ...persona,
    documento: null,
    rolSinVehiculo: 'Testigo',
  })
  assert.deepEqual(errores(personaExternaAltaSchema.safeParse(sinClave(testigo))), [])
})

test('datos cargados con una sola variante se reconocen; lo desconocido vuelve vacío', () => {
  const titular = titularAFormulario({ ...vehiculo.titular, lugarEnVehiculo: 'Conductora' })
  assert.deepEqual(
    [titular.estadoCivil, titular.sexo, titular.lugar, titular.lugarOtro],
    ['Viudo/a', 'Femenino', 'Conductor/a', null],
  )
  const raro = titularAFormulario({ ...vehiculo.titular, estadoCivil: 'Comprometida' })
  assert.equal(raro.estadoCivil, null)
})

test('un titular que no iba en el vehículo no trae lugar', () => {
  const titular = titularAFormulario({ ...vehiculo.titular, ibaEnVehiculo: false })
  assert.deepEqual([titular.ibaEnVehiculo, titular.lugar, titular.lugarOtro], [false, null, null])
})

test('el aviso de documento repetido no salta con la propia persona, sí con otra', () => {
  const personas = personasDelSiniestro({ vehiculos: [vehiculo], personasFuera: [] })
  assert.equal(documentoRepetido(personas, '27884102', 'p11'), null)
  assert.equal(documentoRepetido(personas, '27884102', null), 'titular del vehículo AA456EF')
})

// E5-07: abogados y peritos

test('el abogado precarga el formulario con sus representados como claves de persona', () => {
  const abogado = abogadoAFormulario({
    id: 4,
    nombreCompleto: 'Luis Maidana',
    numeroMatricula: null,
    telefono: '341 400-0001',
    email: null,
    representa: [
      { id: 11, nombre: 'Norma Quiroga' },
      { id: 12, nombre: null },
    ],
  })
  assert.deepEqual(abogado.representados, ['p11', 'p12'])
  assert.deepEqual(abogado.representados.map(idDePersona), [11, 12])
  assert.deepEqual(errores(abogadoAltaSchema.safeParse(sinClave(abogado))), [])
})

test('las personas guardadas se agrupan como en el paso 3 del alta, con su abogado actual', () => {
  const conAbogado = {
    vehiculos: [
      {
        ...vehiculo,
        titular: { ...vehiculo.titular, abogado: { id: 4, nombreCompleto: 'Luis Maidana' } },
      },
    ],
    personasFuera: [{ id: 13, ...persona, nombre: 'Rita Paz', rolSinVehiculo: null }],
  }
  const grupos = gruposRepresentables(
    representablesDeFicha(conAbogado),
    nombresPersonas(personasDelSiniestro(conAbogado)),
  )
  assert.deepEqual(
    grupos.map((g) => [g.titulo, g.personas.map((p) => [p.clave, p.nombre, p.detalle])]),
    [
      [
        'Vehículo AA456EF · Tercero',
        [
          ['p11', 'Norma Quiroga', 'Titular'],
          ['p12', 'Desconocido 1', 'Ocupante · en la caja'],
        ],
      ],
      ['Fuera de los vehículos', [['p13', 'Rita Paz', 'Fuera de los vehículos']]],
    ],
  )
  const representantes = representantesDeFicha(conAbogado)
  assert.deepEqual([...representantes], [['p11', { clave: 'a4', nombreCompleto: 'Luis Maidana' }]])
})

test('las fechas del perito vuelven como su día en la Argentina', () => {
  const perito = peritoAFormulario({
    id: 9,
    tipo: 'CESVI',
    nombre: 'Jorge Benítez',
    telefono: null,
    email: null,
    // 1 de octubre a las 23 en la Argentina: en UTC ya es el 2
    fechaSolicitud: '2026-10-02T02:00:00.000Z',
    fechaCierre: null,
    cerrado: false,
  })
  assert.deepEqual([perito.fechaSolicitud, perito.fechaCierre], ['2026-10-01', null])
  // cerrado sale de la fecha de cierre: el formulario no lo manda
  const { cerrado: _cerrado, ...enviado } = perito
  assert.deepEqual(errores(peritoAltaSchema.safeParse(enviado)), [])
})
