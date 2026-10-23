import { getPrisma } from '../../lib/prisma.ts'
import { crearAlmacenamientoR2, type AlmacenamientoR2 } from '../../lib/r2.ts'
import { requerirSesion } from '../auth/auth.module.ts'
import { crearPlantillasRouter } from './plantillas.routes.ts'
import { crearServicioPlantillas } from './plantillas.service.ts'

let r2: AlmacenamientoR2 | undefined
export const plantillasRouter = crearPlantillasRouter({
  requerirSesion,
  servicio: crearServicioPlantillas({
    prisma: {
      get usuario() {
        return getPrisma().usuario
      },
      get documentoPlantilla() {
        return getPrisma().documentoPlantilla
      },
    },
    almacenamiento: () => (r2 ??= crearAlmacenamientoR2()),
  }),
})
