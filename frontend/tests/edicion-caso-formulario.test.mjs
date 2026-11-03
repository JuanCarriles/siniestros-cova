import assert from 'node:assert/strict'
import test from 'node:test'
import { resolverEdicionCaso } from '../src/features/siniestros/ficha/edicion-caso-formulario.ts'

const valores = () => ({
  revision: 0,
  pais: '1',
  poliza: {
    numeroSiniestro: ' CASO-1 ',
    numeroPoliza: 'POL-1',
    inicioVigencia: '',
    idAseguradora: '1',
    sucursal: 'Central',
  },
  asignacion: { idAjustador: '' },
  hecho: { fechaOcurrencia: '', horaOcurrencia: '', menorEdadInvolucrado: false, causa: '' },
  lugar: { idProvincia: '1', localidad: '', calle: '', codigoPostal: '' },
})
const resolver = (administra, datos) =>
  resolverEdicionCaso(administra)(datos, undefined, {
    fields: {},
    shouldUseNativeValidation: false,
  })

test('edición: zodResolver transforma los campos y no envía país ni responsable', async () => {
  const { values, errors } = await resolver(true, valores())
  assert.deepEqual(errors, {})
  assert.equal(values.poliza.numeroSiniestro, 'CASO-1')
  assert.equal(values.poliza.idAseguradora, 1)
  assert.equal(values.asignacion.idAjustador, null)
  assert.equal(values.hecho.causa, null)
  assert.equal('pais' in values, false)
  assert.equal('idUsuario' in values.asignacion, false)
})

test('edición del gestor: póliza histórica incompleta no bloquea ni se envía', async () => {
  const datos = valores()
  datos.poliza.numeroSiniestro = ''
  datos.poliza.sucursal = ''
  datos.poliza.idAseguradora = ''
  const { values, errors } = await resolver(false, datos)
  assert.deepEqual(errors, {})
  assert.deepEqual(Object.keys(values).sort(), ['hecho', 'lugar', 'revision'])
  assert.equal(values.revision, 0)
})

test('edición: los requisitos de póliza, fecha y provincia se marcan en su campo', async () => {
  const datos = valores()
  datos.poliza.numeroSiniestro = ''
  datos.hecho.horaOcurrencia = '18:30'
  datos.lugar.idProvincia = ''
  const administrador = await resolver(true, datos)
  assert.ok(administrador.errors.poliza.numeroSiniestro.message)
  assert.ok(administrador.errors.hecho.fechaOcurrencia.message)
  assert.match(administrador.errors.lugar.idProvincia.message, /provincia/)
  assert.deepEqual(administrador.values, {})
  const gestor = await resolver(false, datos)
  assert.equal(gestor.errors.poliza, undefined)
  assert.ok(gestor.errors.hecho.fechaOcurrencia.message)
  assert.match(gestor.errors.lugar.idProvincia.message, /provincia/)
})
