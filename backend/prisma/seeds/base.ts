import type { Prisma } from '../../src/generated/prisma/client.ts'
import {
  ESTADOS_SINIESTRO,
  PAIS_ARGENTINA,
  PROVINCIAS_ARGENTINA,
  TIPOS_DOCUMENTO,
} from './catalogos.ts'

type Tx = Prisma.TransactionClient

export interface ResumenSeedBase {
  pais: 'creado' | 'existente'
  provincias: number
  estados: number
  tiposDocumento: number
}

// Datos de referencia para desarrollo y producción.
//
// Idempotente gracias a los UNIQUE por nombre: skipDuplicates (ON CONFLICT DO NOTHING) inserta
// SOLO lo que falta y no modifica ni reactiva lo existente (los dados de baja también cuentan).
// Puede correrse en cada deploy. Los números del resumen son registros creados.
export async function seedBase(tx: Tx): Promise<ResumenSeedBase> {
  const paisExistente = await tx.pais.findUnique({ where: { nombre: PAIS_ARGENTINA } })
  const pais = await tx.pais.upsert({
    where: { nombre: PAIS_ARGENTINA },
    update: {},
    create: { nombre: PAIS_ARGENTINA },
  })

  const provincias = await tx.provincia.createMany({
    data: PROVINCIAS_ARGENTINA.map((nombre) => ({ nombre, idPais: pais.id })),
    skipDuplicates: true,
  })

  const estados = await tx.estadoSiniestro.createMany({
    data: ESTADOS_SINIESTRO.map((e) => ({ ...e })),
    skipDuplicates: true,
  })

  const tiposDocumento = await tx.tipoDocumento.createMany({
    data: TIPOS_DOCUMENTO.map((nombre) => ({ nombre })),
    skipDuplicates: true,
  })

  return {
    pais: paisExistente ? 'existente' : 'creado',
    provincias: provincias.count,
    estados: estados.count,
    tiposDocumento: tiposDocumento.count,
  }
}
