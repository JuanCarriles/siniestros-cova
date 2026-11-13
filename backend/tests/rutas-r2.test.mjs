import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { S3Client } from '@aws-sdk/client-s3'
import { leerConfiguracionR2 } from '../src/config/r2.ts'
import { crearAlmacenamientoR2 } from '../src/lib/r2.ts'
import {
  leerEntornoR2,
  conEntornoR2,
  carpetaNumerosR2,
  segmentoNumeroR2,
  perteneceClaveSiniestroR2,
  carpetaConIdR2,
  esCarpetaSiniestroAnteriorR2,
  nombreLegibleR2,
  claveInformeR2,
  claveInformeR2Schema,
} from '../src/lib/rutas-r2.ts'

test('entornos: Docker local puede usar dev aunque NODE_ENV sea production; no acepta valores arbitrarios', () => {
  assert.equal(leerEntornoR2({ NODE_ENV: 'production', R2_ENTORNO: 'dev' }), 'dev')
  for (const R2_ENTORNO of [undefined, ''])
    assert.throws(
      () => leerEntornoR2({ NODE_ENV: 'production', R2_ENTORNO }),
      /R2_ENTORNO es obligatorio/,
    )
  assert.equal(leerEntornoR2({}), 'dev')
  assert.throws(() => leerEntornoR2({ R2_ENTORNO: 'prod' }))
  assert.equal(conEntornoR2('dev/siniestros/1/1', 'dev'), 'dev/siniestros/1/1')
  assert.throws(() => conEntornoR2('produccion/siniestros/1/1', 'dev'), { status: 403 })
})

test('arranque: producción exige entorno explícito antes de levantar la API, sin exponer secretos', () => {
  const secreto = 'NO-DEBE-APARECER-EN-ERRORES'
  const ejecutar = (NODE_ENV, R2_ENTORNO) =>
    spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--input-type=module',
        '-e',
        `const {env}=await import('./src/config/env.ts');console.log(env.R2_ENTORNO)`,
      ],
      {
        cwd: new URL('../', import.meta.url),
        env: {
          ...process.env,
          NODE_ENV,
          R2_ENTORNO,
          RESEND_API_KEY: secreto,
          R2_SECRET_ACCESS_KEY: secreto,
        },
        encoding: 'utf8',
        timeout: 10000,
      },
    )
  for (const entorno of ['', 'invalido']) {
    const resultado = ejecutar('production', entorno)
    assert.equal(resultado.status, 1)
    assert.match(resultado.stderr, /R2_ENTORNO/)
    assert.ok(!resultado.stderr.includes(secreto))
    assert.equal(resultado.stdout, '')
  }
  for (const [nodeEnv, entorno, esperado] of [
    ['production', 'dev', 'dev'],
    ['production', 'produccion', 'produccion'],
    ['development', '', 'dev'],
    ['test', '', 'dev'],
  ]) {
    const resultado = ejecutar(nodeEnv, entorno)
    assert.equal(resultado.status, 0, resultado.stderr)
    assert.equal(resultado.stdout.trim(), esperado)
  }
})

test('números visibles y escape reversible: no mezcla slash, guiones, underscore, ceros ni caracteres especiales', () => {
  // Una sola carpeta por siniestro: {nºsiniestro}-{nºpóliza}
  assert.equal(carpetaNumerosR2({ numeroSiniestro: '1', numeroPoliza: '1' }), 'siniestros/1-1')
  assert.equal(
    carpetaNumerosR2({ numeroSiniestro: '2026-04871', numeroPoliza: '01-AU/558812' }),
    'siniestros/2026-04871-01-AU_2F558812',
    'una barra del número no crea una subcarpeta',
  )
  const valores = ['', '_', '.', '..', 'A/B', 'A-B', 'A_2FB', '01', '1', 'Póliza 1', 'A\\B']
  const segmentos = valores.map(segmentoNumeroR2)
  assert.equal(new Set(segmentos).size, valores.length)
  for (const segmento of segmentos) assert.match(segmento, /^[a-zA-Z0-9._-]+$/)
  assert.equal(segmentoNumeroR2('A/B'), 'A_2FB')
})

test('propiedad: permite rutas antiguas y actuales del caso, nunca carpetas vecinas, subcarpetas de otro caso ni otro entorno', () => {
  const caso = { id: 7, carpetaR2: 'siniestros/1/1' }
  for (const clave of ['siniestros/7/a.pdf', 'dev/siniestros/7/a.pdf', 'dev/siniestros/1/1/a.pdf'])
    assert.equal(perteneceClaveSiniestroR2(clave, caso, 'dev'), true, clave)
  for (const clave of [
    'siniestros/70/a.pdf',
    'dev/siniestros/1/1/siniestro-8/a.pdf',
    'dev/siniestros/7/otro/a.pdf',
    'produccion/siniestros/1/1/a.pdf',
    'dev/siniestros/1/10/a.pdf',
  ])
    assert.equal(perteneceClaveSiniestroR2(clave, caso, 'dev'), false, clave)
})

for (const entorno of ['dev', 'produccion'])
  test(`SDK ${entorno}: subidas y copias privadas en su entorno; descargas anteriores compatibles y entorno ajeno bloqueado`, async () => {
    const config = leerConfiguracionR2({
      R2_ACCOUNT_ID: 'a'.repeat(32),
      R2_ACCESS_KEY_ID: 'prueba',
      R2_SECRET_ACCESS_KEY: 'prueba',
      R2_BUCKET: 'prueba-bucket',
      R2_ENTORNO: entorno,
    })
    const cliente = new S3Client({
      region: 'auto',
      credentials: { accessKeyId: 'prueba', secretAccessKey: 'prueba' },
    })
    const comandos = []
    cliente.send = async (c) => {
      comandos.push(c)
      return {}
    }
    const r2 = crearAlmacenamientoR2(config, cliente)
    try {
      const subido = await r2.subir(
        { nombreOriginal: 'A.pdf', contenido: Buffer.from('%PDF-1.4 Prueba') },
        'siniestros/1/1',
      )
      assert.ok(subido.clave.startsWith(`${entorno}/siniestros/1/1/`))
      assert.equal(comandos[0].input.ACL, undefined)
      assert.match(comandos[0].input.ContentDisposition, /^attachment;/)
      assert.equal(
        await r2.copiar('siniestros/7/a.pdf', 'siniestros/1/1'),
        `${entorno}/siniestros/1/1/a.pdf`,
      )
      assert.equal(comandos.at(-1).input.CopySource, 'prueba-bucket/siniestros/7/a.pdf')
      await r2.subirInforme(
        'informes mensuales/2026/11/11111111-1111-4111-8111-111111111111.pdf',
        Buffer.from('%PDF-1.4 Prueba'),
      )
      assert.ok(comandos.at(-1).input.Key.startsWith(`${entorno}/informes mensuales/`))
      for (const key of ['siniestros/7/a.pdf', subido.clave]) {
        const firmado = await r2.firmarDescarga(key, 'A.pdf', 'application/pdf')
        const url = new URL(firmado.url)
        assert.equal(decodeURIComponent(url.pathname), `/${key}`)
        assert.equal(url.searchParams.get('X-Amz-Expires'), '60')
      }
      const ajeno = entorno === 'dev' ? 'produccion' : 'dev',
        antes = comandos.length
      const key = `${ajeno}/siniestros/1/1/a.pdf`
      for (const accion of [
        () => r2.comprobarExistencia(key),
        () => r2.eliminar(key),
        () => r2.firmarDescarga(key, 'A.pdf', 'application/pdf'),
        () => r2.leerParaVista(key),
        () => r2.copiar(key, 'siniestros/1/1'),
        () =>
          r2.subir(
            { nombreOriginal: 'A.pdf', contenido: Buffer.from('%PDF-1.4') },
            `${ajeno}/siniestros/1/1`,
          ),
        () =>
          r2.subirDerivada(
            `${ajeno}/siniestros/1/1/11111111-1111-4111-8111-111111111111.webp`,
            Buffer.from('x'),
          ),
      ])
        await assert.rejects(accion, { status: 403 })
      assert.equal(comandos.length, antes, 'el rechazo ocurre antes de enviar solicitudes a R2')
    } finally {
      r2.cerrar()
    }
  })

test('carpetas: el segundo siniestro con la misma carpeta lleva su id; se reconoce el formato anterior', () => {
  assert.equal(carpetaConIdR2('siniestros/1-1', 57), 'siniestros/1-1-id57')
  assert.equal(esCarpetaSiniestroAnteriorR2('siniestros/1/1'), true)
  assert.equal(esCarpetaSiniestroAnteriorR2('siniestros/1/1/siniestro-8'), true)
  assert.equal(esCarpetaSiniestroAnteriorR2('siniestros/1-1'), false)
  assert.equal(esCarpetaSiniestroAnteriorR2('siniestros/1-1-id57'), false)
})

test('nombres legibles: nombre original limpio + código, sin tildes, espacios ni símbolos', () => {
  assert.equal(
    nombreLegibleR2('DNI frente (1).jpg', 'jpg', '3f9a2c41'),
    'dni-frente-1-3f9a2c41.jpg',
  )
  assert.equal(
    nombreLegibleR2('Peña Ñandú – acta.PDF', 'pdf', 'ab12cd34'),
    'pena-nandu-acta-ab12cd34.pdf',
  )
  assert.equal(
    nombreLegibleR2('...', 'pdf', 'ab12cd34'),
    'archivo-ab12cd34.pdf',
    'sin nada legible',
  )
  const largo = nombreLegibleR2(`${'x'.repeat(90)}.png`, 'png', 'ab12cd34')
  assert.equal(largo, `${'x'.repeat(60)}-ab12cd34.png`, 'hasta 60 caracteres')
  assert.match(
    nombreLegibleR2('Foto.jpeg', 'jpg'),
    /^foto-[0-9a-f]{8}\.jpg$/,
    'un código nuevo por subida',
  )
  assert.notEqual(nombreLegibleR2('a.pdf', 'pdf'), nombreLegibleR2('a.pdf', 'pdf'))
})

test('informes: informes/{AAAA}/{AAAA-MM}-{código}.pdf; se siguen leyendo los anteriores', () => {
  assert.equal(claveInformeR2('2026-10', false, 'ab12cd34'), 'informes/2026/2026-10-ab12cd34.pdf')
  assert.equal(
    claveInformeR2('2026-10', true, 'ab12cd34'),
    'informes/pruebas/2026/2026-10-ab12cd34.pdf',
  )
  for (const clave of [
    'produccion/informes/2026/2026-10-ab12cd34.pdf',
    'dev/informes/pruebas/2026/2026-10-ab12cd34.pdf',
    'informes mensuales/2026/10/11111111-1111-4111-8111-111111111111.pdf',
    'produccion/informes mensuales/pruebas/2026/10/11111111-1111-4111-8111-111111111111.pdf',
  ])
    assert.equal(claveInformeR2Schema.safeParse(clave).success, true, clave)
  for (const clave of [
    'informes/2026/2026-10-ab12cd34.pdf',
    'produccion/informes/2026/2026-13-x.pdf',
  ])
    assert.equal(claveInformeR2Schema.safeParse(clave).success, false, clave)
})
