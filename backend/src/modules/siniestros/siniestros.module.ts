import { crearAlmacenamientoR2, type AlmacenamientoR2 } from '../../lib/r2.ts'
import { getPrisma } from '../../lib/prisma.ts'
import { requerirSesion } from '../auth/auth.module.ts'
import { crearServicioAltaSiniestros } from './siniestros-alta.service.ts'
import { crearServicioBajasSiniestros } from './siniestros-bajas.service.ts'
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
  get ajustador() {
    return getPrisma().ajustador
  },
  get pais() {
    return getPrisma().pais
  },
  get provincia() {
    return getPrisma().provincia
  },
  get tipoDocumento() {
    return getPrisma().tipoDocumento
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
    transaccion: (trabajo) => getPrisma().$transaction(trabajo, { timeout: 15_000 }),
  },
})

export const siniestrosRouter = crearSiniestrosRouter({
  servicio: crearServicioSiniestros(db),
  alta: crearServicioAltaSiniestros(db),
  operaciones,
  requerirSesion,
})
