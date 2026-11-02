import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ocupanteAltaSchema,
  personaExternaAltaSchema,
  titularAltaSchema,
  vehiculoAltaSchema,
} from '../../shared/src/schemas/siniestros-alta.ts'
import {
  aseguradorasPara,
  externaAFormulario,
  ocupanteAFormulario,
  opcionesPara,
  personasDelSiniestro,
  titularAFormulario,
  vehiculoAFormulario,
} from '../src/features/siniestros/ficha/partes-formulario.ts'
import { documentoRepetido } from '../src/features/siniestros/personas-alta.ts'

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

test('un catálogo dado de baja que el registro tiene guardado sigue en su lista y se conserva', () => {
  const opciones = {
    aseguradoras: [{ id: 1, nombre: 'Litoral Seguros' }],
    paises: [{ id: 1, nombre: 'Argentina' }],
    provincias: [{ id: 2, nombre: 'Córdoba', idPais: 1 }],
    tiposDocumento: [{ id: 1, nombre: 'DNI' }],
  }
  // Sancor (3), Santa Fe (21) y "Pasaporte" (4) se dieron de baja después de cargarse
  const titular = {
    ...vehiculo.titular,
    idTipoDocumento: 4,
    tipoDocumento: 'Pasaporte',
    domicilio: { ...persona.domicilio, idPais: 1 },
  }
  const paraPersona = opcionesPara(opciones, titular)
  assert.deepEqual(paraPersona.provincias.at(-1), {
    id: 21,
    nombre: 'Santa Fe (dada de baja)',
    idPais: 1,
  })
  assert.deepEqual(paraPersona.tiposDocumento.at(-1), { id: 4, nombre: 'Pasaporte (dado de baja)' })
  // El país sigue activo: no se repite
  assert.equal(paraPersona.paises.length, 1)
  assert.deepEqual(aseguradorasPara(opciones.aseguradoras, vehiculo).at(-1), {
    id: 3,
    nombre: 'Sancor (dada de baja)',
  })
  // Para cargar uno nuevo, solo los activos
  assert.equal(opcionesPara(opciones, null), opciones)
  assert.equal(aseguradorasPara(opciones.aseguradoras, null).length, 1)
})
