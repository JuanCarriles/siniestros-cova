import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as schemas from '../src/index.ts'

const instante = '2026-10-13T15:30:00.000Z'
const examples = [
  ['Pais', { nombre: 'Argentina' }],
  ['Provincia', { nombre: 'Buenos Aires', idPais: 1 }],
  ['Direccion', {}],
  [
    'Usuario',
    {
      nombres: 'Ana',
      apellidos: 'Pérez',
      documento: '00123456',
      telefono: '+54 11 1234-5678',
      email: 'ana@example.com',
      contrasena: 'Una clave de prueba 123',
      tipoUsuario: 'GESTOR',
      idDireccion: 1,
    },
  ],
  [
    'DocumentoPlantilla',
    {
      nombreOriginal: 'modelo.pdf',
      urlArchivo: 'plantillas/modelo.pdf',
      tipoExtension: 'pdf',
      idUsuario: 1,
    },
  ],
  [
    'Notificacion',
    {
      mensaje: 'Nuevo mensaje',
      leida: false,
      revisada: false,
      idUsuario: 1,
      idSiniestro: 1,
      tipoNotificacion: 'MENSAJE_NUEVO',
    },
  ],
  [
    'HistorialSiniestro',
    { tipoEvento: 'DOCUMENTO', descripcion: 'Documento incorporado', idSiniestro: 1, idUsuario: 1 },
  ],
  ['MensajeChat', { contenidoMensaje: 'Hola', idUsuario: 1, idSiniestro: 1 }],
  ['LecturaMensajeChat', { idMensajeChat: 1, idUsuario: 2, fechaLeido: instante }],
  [
    'DocumentoSiniestro',
    {
      nombreOriginal: 'foto.jpg',
      urlArchivoSinDominio: 'siniestros/1/foto.jpg',
      tipoExtension: 'jpg',
      mimeType: 'image/jpeg',
      tamanoBytes: '1024',
      idUsuario: 1,
      idSiniestro: 1,
    },
  ],
  [
    'NovedadSiniestro',
    { descripcion: 'Se recibió la documentación', autor: 'Ana Pérez', idSiniestro: 1 },
  ],
  [
    'Perito',
    {
      nombre: 'Ana Pérez',
      fechaSolicitud: instante,
      cerrado: false,
      idSiniestro: 1,
      tipoPerito: 'MEDICO',
    },
  ],
  ['Aseguradora', { nombre: 'Aseguradora de prueba' }],
  [
    'Ajustador',
    {
      nombres: 'Ana',
      apellidos: 'Pérez',
      email: 'ana@example.com',
      telefono: '11 1234-5678',
      idAseguradora: 1,
    },
  ],
  ['Abogado', { nombreCompleto: 'Ana Pérez' }],
  ['Vehiculo', { dominio: 'AB123CD' }],
  ['TipoDocumento', { nombre: 'DNI' }],
  ['PersonaInvolucrada', { idSiniestro: 1 }],
  ['EstadoSiniestro', { nombre: 'En trámite', descripcion: 'Caso abierto' }],
  [
    'Siniestro',
    {
      numeroSiniestro: '0001',
      numeroPoliza: '0002',
      fechaAsignacion: instante,
      demorado: false,
      menorEdadInvolucrado: false,
      idEstadoSiniestro: 1,
      idAseguradora: 1,
      idUsuario: 1,
    },
  ],
]

const prisma = readFileSync(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8')
const models = new Map(
  [...prisma.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((match) => [match[1], match[2]]),
)

// Tablas que solo usa el backend: no tienen alta ni edición desde la interfaz
const internos = new Set(['Sesion'])

test('cubre todas las entidades de Prisma sin modelos adicionales', () => {
  assert.deepEqual(
    examples.map(([name]) => name).sort(),
    [...models.keys()].filter((name) => !internos.has(name)).sort(),
  )
})

for (const [name, example] of examples) {
  const stem = name[0].toLowerCase() + name.slice(1)
  const create = schemas[`${stem}Schema`]
  const update = schemas[`${stem}UpdateSchema`]
  test(`${name}: admite un alta válida y rechaza campos ajenos y de baja`, () => {
    assert.equal(create.safeParse(example).success, true)
    for (const extra of [
      { inventado: 1 },
      { id: 2 },
      { eliminado: true },
      { fechaBaja: instante },
    ]) {
      assert.equal(create.safeParse({ ...example, ...extra }).success, false)
      assert.equal(update.safeParse(extra).success, false)
    }
    assert.equal(update.safeParse({}).success, false)
  })

  test(`${name}: respeta obligatoriedad, null y actualizaciones parciales según Prisma`, () => {
    const fields = [
      ...models
        .get(name)
        .matchAll(
          /^\s*(\w+)\s+(String|Int|BigInt|DateTime|Boolean|Tipo\w+|RolAccidente|UsoVehiculo)(\??)(\[\])?([^\n]*)/gm,
        ),
    ].filter(
      (match) =>
        !['id', 'eliminado', 'fechaBaja'].includes(match[1]) && !match[4] && !models.has(match[2]),
    )
    assert.deepEqual(Object.keys(create.shape).sort(), fields.map((match) => match[1]).sort())
    for (const [, field, , nullable, , attributes] of fields) {
      assert.equal(
        create.safeParse({ ...example, [field]: null }).success,
        Boolean(nullable),
        field,
      )
      assert.equal(update.safeParse({ [field]: null }).success, Boolean(nullable), field)
      if (nullable) {
        assert.equal(create.parse({ ...example, [field]: '  ' })[field], null)
        assert.equal(update.parse({ [field]: '' })[field], null)
      } else if (!attributes.includes('@default(')) {
        // Sin valor por defecto en Prisma (now(), false, etc.): omitirlo tiene que fallar
        const omitted = { ...example }
        delete omitted[field]
        assert.equal(create.safeParse(omitted).success, false, field)
      }
    }
    for (const [field, value] of Object.entries(example)) {
      assert.equal(update.safeParse({ [field]: value }).success, true, field)
      assert.equal(update.safeParse({ [field]: undefined }).success, false, field)
    }
  })
}

test('enums: acepta exactamente los valores definidos en Prisma', () => {
  for (const [, name, body] of prisma.matchAll(/^enum (\w+) \{([\s\S]*?)^\}/gm)) {
    const schema = schemas[`${name[0].toLowerCase()}${name.slice(1)}Schema`]
    assert.deepEqual(schema.options, body.trim().split(/\s+/))
    for (const value of schema.options) assert.equal(schema.safeParse(value).success, true)
    for (const value of ['', 'INVALIDO', schema.options[0].toLowerCase()]) {
      assert.equal(schema.safeParse(value).success, false)
    }
  }
})

test('IDs: convierte selecciones decimales sin coerciones ambiguas ni desbordamientos', () => {
  assert.equal(schemas.idSchema.parse(' 123 '), 123)
  assert.equal(schemas.idSchema.parse(2147483647), 2147483647)
  for (const value of [
    '',
    ' ',
    null,
    true,
    false,
    0,
    -1,
    1.5,
    '1.5',
    '1e3',
    '0x10',
    'Infinity',
    NaN,
    Infinity,
    2147483648,
  ]) {
    assert.equal(schemas.idSchema.safeParse(value).success, false, String(value))
  }
})

test('enteros: respeta los límites PostgreSQL de Int y SmallInt', () => {
  assert.equal(schemas.enteroSchema.parse('-2147483648'), -2147483648)
  assert.equal(schemas.enteroSchema.safeParse(-2147483649).success, false)
  assert.equal(schemas.vehiculoSchema.parse({ dominio: 'AB123CD', anio: '2026' }).anio, 2026)
  assert.equal(schemas.enteroPequenoSchema.parse(32767), 32767)
  for (const value of [-32769, 32768, 2026.5])
    assert.equal(schemas.enteroPequenoSchema.safeParse(value).success, false)
})

test('texto y email: rechaza vacíos e emails inválidos, conserva datos textuales', () => {
  assert.deepEqual(schemas.aseguradoraSchema.parse({ nombre: '  Cova  ' }), { nombre: 'Cova' })
  for (const nombre of ['', '   ', 'x'.repeat(101)]) {
    assert.equal(schemas.aseguradoraSchema.safeParse({ nombre }).success, false)
  }
  assert.equal(schemas.emailSchema.parse(' ana@example.com '), 'ana@example.com')
  assert.equal(schemas.emailSchema.safeParse('ana@').success, false)
  assert.equal(schemas.documentoSchema.parse('00123456'), '00123456')
  assert.equal(schemas.contrasenaSchema.parse('  Mi clave  '), '  Mi clave  ')
  assert.equal(schemas.contrasenaSchema.safeParse('   ').success, false)
})

test('fechas de calendario: rechaza días inexistentes y no cambia de zona horaria', () => {
  assert.equal(schemas.fechaSchema.parse('2024-02-29'), '2024-02-29')
  for (const value of [
    '2025-02-29',
    '2026-04-31',
    '2026-13-01',
    '13/10/2026',
    '2026-10-13T00:00:00Z',
    0,
    null,
  ]) {
    assert.equal(schemas.fechaSchema.safeParse(value).success, false, String(value))
  }
})

test('horas y timestamps: distingue hora independiente e instante con zona', () => {
  assert.equal(schemas.horaSchema.parse('09:30'), '09:30')
  assert.equal(schemas.horaSchema.parse('09:30:45.123'), '09:30:45.123')
  for (const value of ['24:00', '12:60', '09:30Z', '09:30-03:00'])
    assert.equal(schemas.horaSchema.safeParse(value).success, false)
  assert.equal(schemas.fechaHoraSchema.parse(instante), instante)
  assert.equal(
    schemas.fechaHoraSchema.parse('2026-10-13T12:30:00-03:00'),
    '2026-10-13T12:30:00-03:00',
  )
  for (const value of ['2026-10-13', '2026-10-13T12:30:00', '2026-02-30T12:30:00Z'])
    assert.equal(schemas.fechaHoraSchema.safeParse(value).success, false)
})

test('booleanos opcionales: false sigue siendo false, vacío se limpia con null', () => {
  assert.equal(
    schemas.personaInvolucradaSchema.parse({ idSiniestro: 1, esOcupante: false }).esOcupante,
    false,
  )
  assert.equal(
    schemas.personaInvolucradaSchema.parse({ idSiniestro: 1, esOcupante: '' }).esOcupante,
    null,
  )
  for (const value of ['false', 'true', 0, 1])
    assert.equal(schemas.booleanoSchema.safeParse(value).success, false)
  assert.equal(
    schemas.personaInvolucradaSchema.safeParse({ idSiniestro: 1, esOcupante: 'false' }).success,
    false,
  )
})

test('BigInt: no pierde precisión y la salida se puede enviar como JSON', () => {
  for (const input of [0, 1024n, '9007199254740993', '9223372036854775807']) {
    const output = schemas.tamanoBytesSchema.parse(input)
    assert.equal(output, String(input))
    assert.doesNotThrow(() => JSON.stringify({ tamanoBytes: output }))
  }
  for (const input of [
    -1,
    '-1',
    '1.5',
    '1e3',
    '',
    null,
    true,
    1.5,
    9007199254740992,
    '9223372036854775808',
  ]) {
    assert.equal(schemas.tamanoBytesSchema.safeParse(input).success, false, String(input))
  }
})

test('lecturas: exige lector y fecha; no acepta los campos globales anteriores', () => {
  assert.equal(
    schemas.lecturaMensajeChatSchema.safeParse({ idMensajeChat: 1, idUsuario: 2 }).success,
    false,
  )
  assert.equal(
    schemas.mensajeChatSchema.safeParse({
      contenidoMensaje: 'Hola',
      idUsuario: 1,
      idSiniestro: 1,
      leido: true,
    }).success,
    false,
  )
})

test('URL genérica: valida HTTP/HTTPS; los documentos guardan claves relativas', () => {
  assert.equal(
    schemas.urlArchivoSchema.safeParse('https://archivos.example.com/modelo.pdf').success,
    true,
  )
  for (const value of ['javascript:alert(1)', 'archivo.pdf', 'mailto:ana@example.com']) {
    assert.equal(schemas.urlArchivoSchema.safeParse(value).success, false)
  }
  assert.equal(schemas.claveArchivoSchema.parse('siniestros/1/foto.jpg'), 'siniestros/1/foto.jpg')
  for (const value of [
    'https://example.com/modelo.pdf',
    '/modelo.pdf',
    '../modelo.pdf',
    'x/../y',
    'x//y',
    'C:\\modelo.pdf',
    'modelo.pdf?firma=secreto',
    'modelo.pdf#x',
  ]) {
    assert.equal(schemas.claveArchivoSchema.safeParse(value).success, false)
    assert.equal(
      schemas.documentoPlantillaUpdateSchema.safeParse({ urlArchivo: value }).success,
      false,
    )
    assert.equal(
      schemas.documentoSiniestroUpdateSchema.safeParse({ urlArchivoSinDominio: value }).success,
      false,
    )
  }
})

test('baja y restauración: sólo admite pares consistentes', () => {
  assert.equal(
    schemas.bajaLogicaSchema.safeParse({ eliminado: false, fechaBaja: null }).success,
    true,
  )
  assert.equal(
    schemas.bajaLogicaSchema.safeParse({ eliminado: true, fechaBaja: instante }).success,
    true,
  )
  for (const input of [
    { eliminado: false, fechaBaja: instante },
    { eliminado: true, fechaBaja: null },
    { eliminado: true },
  ]) {
    assert.equal(schemas.bajaLogicaSchema.safeParse(input).success, false)
  }
})

test('login: email válido y contraseña sin recortar; nada más', () => {
  const login = { email: '  ana@example.com ', contrasena: ' clave con espacios ' }
  assert.deepEqual(schemas.loginSchema.parse(login), {
    email: 'ana@example.com',
    contrasena: ' clave con espacios ',
  })
  for (const input of [
    {},
    { email: 'ana@example.com' },
    { email: 'no-es-un-email', contrasena: 'x' },
    { email: 'ana@example.com', contrasena: '' },
    { email: 'ana@example.com', contrasena: '   ' },
    { ...login, recordarme: true },
  ]) {
    assert.equal(schemas.loginSchema.safeParse(input).success, false)
  }
})
