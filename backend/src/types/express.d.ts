import type { SesionUsuario } from '@cova/shared/schemas/auth'

declare global {
  namespace Express {
    interface Request {
      /** Usuario de la sesión. Lo completa el middleware requerirSesion (middlewares/autenticar.ts). */
      usuario?: SesionUsuario
    }
  }
}

export {}
