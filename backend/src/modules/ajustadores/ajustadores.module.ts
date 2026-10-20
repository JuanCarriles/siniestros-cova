import { getPrisma } from '../../lib/prisma.ts'
import { requerirSesion } from '../auth/auth.module.ts'
import { crearAjustadoresRouter } from './ajustadores.routes.ts'
import { crearServicioAjustadores } from './ajustadores.service.ts'

// Acceso diferido a la base: el cliente se crea en el primer pedido, no al importar
const db = {
  get ajustador() {
    return getPrisma().ajustador
  },
  get aseguradora() {
    return getPrisma().aseguradora
  },
}

export const ajustadoresRouter = crearAjustadoresRouter({
  servicio: crearServicioAjustadores(db),
  requerirSesion,
})
