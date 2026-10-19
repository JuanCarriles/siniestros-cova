import { getPrisma } from '../../lib/prisma.ts'
import { requerirSesion } from '../auth/auth.module.ts'
import { crearAseguradorasRouter } from './aseguradoras.routes.ts'
import { crearServicioAseguradoras } from './aseguradoras.service.ts'

// Acceso diferido a la base: el cliente se crea en el primer pedido, no al importar
const db = {
  get ajustador() {
    return getPrisma().ajustador
  },
  get aseguradora() {
    return getPrisma().aseguradora
  },
}

export const aseguradorasRouter = crearAseguradorasRouter({
  servicio: crearServicioAseguradoras(db),
  requerirSesion,
})
