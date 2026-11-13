import assert from 'node:assert/strict'
import test from 'node:test'
import { zodResolver } from '@hookform/resolvers/zod'
import { cierreInformeSchema, generarInformeSchema } from '@cova/shared/schemas/informes'

const resolver = (schema, datos) =>
  zodResolver(schema)(datos, undefined, {
    fields: {},
    shouldUseNativeValidation: false,
  })

test('Informe manual: el mes inválido se vincula a su campo y el correo conserva su valor', async () => {
  const invalido = await resolver(generarInformeSchema, { periodo: '', enviarCorreo: false })
  assert.match(invalido.errors.periodo.message, /mes válido/)
  assert.deepEqual(invalido.values, {})
  const valido = await resolver(generarInformeSchema, { periodo: '2026-10', enviarCorreo: true })
  assert.deepEqual(valido.errors, {})
  assert.deepEqual(valido.values, { periodo: '2026-10', enviarCorreo: true })
})

test('Cierre: errores por campo, monto obligatorio con acuerdo y coma decimal transformada', async () => {
  const sinResultado = await resolver(cierreInformeSchema, { montoAcordado: '' })
  assert.match(sinResultado.errors.resultadoCierre.message, /resultado/)
  const sinMonto = await resolver(cierreInformeSchema, {
    resultadoCierre: 'ACUERDO_PAGO',
    montoAcordado: '',
  })
  assert.match(sinMonto.errors.montoAcordado.message, /monto acordado/)
  assert.deepEqual(sinMonto.values, {})
  const valido = await resolver(cierreInformeSchema, {
    resultadoCierre: 'ACUERDO_PAGO',
    montoAcordado: '1250,50',
  })
  assert.deepEqual(valido.errors, {})
  assert.equal(valido.values.montoAcordado, '1250.50')
  const sinAcuerdo = await resolver(cierreInformeSchema, {
    resultadoCierre: 'RECHAZO',
    montoAcordado: '',
  })
  assert.deepEqual(sinAcuerdo.errors, {})
  assert.equal(sinAcuerdo.values.montoAcordado, null)
})
