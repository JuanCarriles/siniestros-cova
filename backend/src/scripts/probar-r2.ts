import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import { leerConfiguracionR2 } from '../config/r2.ts'
import { crearAlmacenamientoR2 } from '../lib/r2.ts'
import { disconnectPrisma, getPrisma } from '../lib/prisma.ts'
import { crearServicioDocumentos } from '../modules/documentos/documentos.service.ts'
import { HttpError } from '../utils/httpError.ts'

// Ejecutar únicamente en desarrollo. No imprime credenciales ni URLs firmadas.
const soloR2 = process.argv.includes('--solo-r2')
const claves: string[] = []
let almacenamiento: ReturnType<typeof crearAlmacenamientoR2> | undefined
let descarga: Awaited<ReturnType<NonNullable<typeof almacenamiento>['firmarDescarga']>> | undefined
let paso = 'configuración'
const contenido = Buffer.from('%PDF-1.4\n% Prueba sintética de conectividad Cova R2\n%%EOF\n')
const archivo = { nombreOriginal: 'prueba-r2.pdf', contenido }

async function comprobarDescarga(resultado: NonNullable<typeof descarga>) {
  const respuesta = await fetch(resultado.url, { signal: AbortSignal.timeout(15_000) })
  console.log('Descarga firmada: HTTP', respuesta.status)
  assert.equal(respuesta.status, 200, 'R2 debe permitir la descarga firmada')
  assert.deepEqual(Buffer.from(await respuesta.arrayBuffer()), contenido, 'Los bytes descargados deben coincidir')
  const privada = new URL(resultado.url)
  privada.search = ''
  const sinFirma = await fetch(privada, { signal: AbortSignal.timeout(15_000) })
  console.log('Solicitud sin firma: HTTP', sinFirma.status)
  const codigo = (await sinFirma.text()).match(/<Code>([^<]+)<\/Code>/)?.[1]
  // R2 responde 400 InvalidArgument si faltan los parámetros de autenticación S3.
  assert.ok([401, 403].includes(sinFirma.status) || (sinFirma.status === 400 && codigo === 'InvalidArgument'),
    'El endpoint S3 debe rechazar la descarga sin firma')
}

try {
  if (process.env.NODE_ENV === 'production') throw Error('Prueba sólo para desarrollo')
  almacenamiento = crearAlmacenamientoR2(leerConfiguracionR2())
  const r2 = almacenamiento
  const registrado = { ...r2, async subir(...args: Parameters<typeof r2.subir>) {
    const resultado = await r2.subir(...args)
    claves.push(resultado.clave)
    return resultado
  } }
  if (soloR2) {
    paso = 'subida y descarga en R2'
    const subido = await registrado.subir(archivo, 'pruebas')
    descarga = await r2.firmarDescarga(subido.clave, subido.nombreOriginal)
    await comprobarDescarga(descarga)
  } else {
    paso = 'conexión y tablas de PostgreSQL'
    const prisma = getPrisma()
    await prisma.documentoSiniestro.count()
    const rollback = new Error('Rollback intencional de los datos de prueba')
    paso = 'subida, persistencia y descarga'
    try {
      await prisma.$transaction(async tx => {
        paso = 'creación de registros temporales en PostgreSQL'
        const usuario = await tx.usuario.create({ data: {
          nombres: 'Prueba', apellidos: 'R2', documento: 'PRUEBA', telefono: 'PRUEBA',
          email: `${randomUUID()}@r2-test.invalid`, contrasena: '!CUENTA-DE-PRUEBA-SIN-LOGIN',
          tipoUsuario: 'GESTOR', direccion: { create: {} },
        } })
        const siniestro = await tx.siniestro.create({ data: {
          numeroSiniestro: 'PRUEBA-R2', numeroPoliza: 'PRUEBA-R2', fechaAsignacion: new Date(),
          demorado: false, menorEdadInvolucrado: false, usuario: { connect: { id: usuario.id } },
          estadoSiniestro: { create: { nombre: 'Prueba R2', descripcion: 'Temporal; se revierte' } },
          aseguradora: { create: { nombre: 'Prueba R2' } },
        } })
        const servicio = crearServicioDocumentos({ prisma: tx, almacenamiento: registrado, autorizar: async acceso => {
          assert.equal(acceso.idUsuario, usuario.id)
          if (acceso.destino.tipo === 'siniestro') assert.equal(acceso.destino.idSiniestro, siniestro.id)
        } })
        for (const destino of [{ tipo: 'siniestro' as const, idSiniestro: siniestro.id }, { tipo: 'plantilla' as const }]) {
          paso = `subida y registro de ${destino.tipo}`
          const documento = await servicio.subir({ idUsuario: usuario.id, destino, archivo })
          paso = `lectura de la clave de ${destino.tipo}`
          const claveGuardada = destino.tipo === 'siniestro'
            ? (await tx.documentoSiniestro.findUniqueOrThrow({ where: { id: documento.id } })).urlArchivoSinDominio
            : (await tx.documentoPlantilla.findUniqueOrThrow({ where: { id: documento.id } })).urlArchivo
          assert.ok(claves.includes(claveGuardada))
          assert.ok(!claveGuardada.includes('://') && !claveGuardada.includes('?'))
          descarga = await servicio.descargar({ idUsuario: usuario.id, tipo: destino.tipo, idDocumento: documento.id })
          paso = `comprobación de descarga de ${destino.tipo}`
          await comprobarDescarga(descarga)
        }
        throw rollback
      }, { timeout: 120_000 })
    } catch (error) {
      if (error !== rollback) throw error
    }
    console.log('OK: ambos tipos de documento guardaron sólo claves en PostgreSQL. Datos de prueba revertidos.')
  }
  console.log('OK: subida con SDK, descarga con bytes idénticos y acceso S3 sin firma rechazado.')
  paso = 'vencimiento de la URL firmada'
  assert.ok(descarga)
  const espera = Math.max(0, new Date(descarga.venceEn).getTime() - Date.now() + 2_000)
  console.log(`Comprobando vencimiento de ${descarga.venceEnSegundos} segundos…`)
  await setTimeout(espera)
  const vencida = await fetch(descarga.url, { signal: AbortSignal.timeout(15_000) })
  await vencida.body?.cancel()
  assert.equal(vencida.status, 403, 'R2 debe rechazar la firma vencida')
  console.log('OK: R2 rechazó la URL vencida.')
} catch (error) {
  console.error(`Falló la prueba en: ${paso}. Revisá la configuración y la disponibilidad de R2/PostgreSQL.`)
  if (error instanceof HttpError) console.error(error.message, error.details ?? '')
  else if (error instanceof assert.AssertionError) console.error(error.message.split('\n')[0])
  else if (error && typeof error === 'object' && 'code' in error && /^P\d{4}$/.test(String(error.code))) {
    console.error('Código Prisma:', error.code)
  }
  process.exitCode = 1
} finally {
  for (const clave of claves) {
    try { await almacenamiento?.eliminar(clave) }
    catch { console.error('No se pudo limpiar el objeto de prueba:', clave); process.exitCode = 1 }
  }
  almacenamiento?.cerrar()
  await disconnectPrisma()
  if (claves.length && process.exitCode !== 1) console.log('OK: objetos de prueba eliminados de R2.')
}
