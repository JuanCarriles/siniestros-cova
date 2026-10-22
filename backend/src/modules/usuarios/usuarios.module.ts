import { getPrisma } from '../../lib/prisma.ts'
import { HttpError } from '../../utils/httpError.ts'
import { requerirSesion } from '../auth/auth.module.ts'
import { crearUsuariosRouter } from './usuarios.routes.ts'
import { crearServicioUsuarios, type BaseUsuarios } from './usuarios.service.ts'

export const baseUsuarios: BaseUsuarios = {
  get usuario() {
    return getPrisma().usuario
  },
  get pais() {
    return getPrisma().pais
  },
  get provincia() {
    return getPrisma().provincia
  },
  async transaccion(trabajo) {
    for (let intento = 0; ; intento++) {
      try {
        return await getPrisma().$transaction(trabajo, { isolationLevel: 'Serializable' })
      } catch (error) {
        const codigo = error && typeof error === 'object' && 'code' in error ? error.code : null
        if (codigo === 'P2034' && intento < 2) continue
        if (codigo === 'P2034')
          throw new HttpError(
            409,
            'Los datos cambiaron mientras guardabas. Actualizá el listado e intentá de nuevo.',
          )
        if (codigo === 'P2002')
          throw new HttpError(409, 'Ya existe un usuario con ese email.', { campo: 'email' })
        throw error
      }
    }
  },
}
export const usuariosRouter = crearUsuariosRouter({
  servicio: crearServicioUsuarios(baseUsuarios),
  requerirSesion,
})
