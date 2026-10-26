import { getPrisma } from '../../lib/prisma.ts'
import { requerirSesion } from '../auth/auth.module.ts'
import { crearServicioAltaSiniestros } from './siniestros-alta.service.ts'
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

export const siniestrosRouter = crearSiniestrosRouter({
  servicio: crearServicioSiniestros(db),
  alta: crearServicioAltaSiniestros(db),
  requerirSesion,
})
