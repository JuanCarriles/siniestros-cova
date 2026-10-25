import { crearAlmacenamientoR2, type AlmacenamientoR2 } from '../../lib/r2.ts'
import { HttpError } from '../../utils/httpError.ts'
import { crearServicioBajasSiniestros } from './siniestros-bajas.service.ts'
import { getPrisma } from '../../lib/prisma.ts'
import { requerirSesion } from '../auth/auth.module.ts'
import { crearSiniestrosRouter } from './siniestros.routes.ts'
import { crearServicioSiniestros } from './siniestros.service.ts'

// Acceso diferido a la base: el cliente se crea en el primer pedido, no al importar
const db = {
  get siniestro() {
    return getPrisma().siniestro
  },
  get estadoSiniestro() {
    return getPrisma().estadoSiniestro
  },
  get aseguradora() {
    return getPrisma().aseguradora
  },
  get usuario() {
    return getPrisma().usuario
  },
  get $queryRaw() {
    const prisma = getPrisma()
    return prisma.$queryRaw.bind(prisma)
  },
}

let almacenamiento: AlmacenamientoR2 | undefined
const operaciones = crearServicioBajasSiniestros({
  almacenamiento: () => (almacenamiento ??= crearAlmacenamientoR2()),
  base: {
    async transaccion(trabajo) {
      for (let intento = 0; ; intento++) {
        try {
          return await getPrisma().$transaction(trabajo, {
            isolationLevel: 'Serializable',
            timeout: 15_000,
          })
        } catch (error) {
          const codigo = error && typeof error === 'object' && 'code' in error ? error.code : null
          if (codigo === 'P2034' && intento < 2) continue
          if (codigo === 'P2034' || codigo === 'P2003')
            throw new HttpError(
              409,
              'Los datos del siniestro cambiaron. Actualizá el listado y reintentá la operación.',
            )
          throw error
        }
      }
    },
  },
})

export const siniestrosRouter = crearSiniestrosRouter({
  servicio: crearServicioSiniestros(db),
  operaciones,
  requerirSesion,
})
