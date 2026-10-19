import type { LoginData, SesionUsuario } from '@cova/shared/schemas/auth'
import type { Prisma } from '../../generated/prisma/client.ts'
import { hashPassword, verifyPassword } from '../../lib/password.ts'
import { HttpError } from '../../utils/httpError.ts'
import type { LimiteIntentos } from './limite-intentos.ts'
import type { ContextoSesion, ServicioSesiones } from './sesiones.service.ts'

type BaseAuth = Pick<Prisma.TransactionClient, 'usuario'>

// Un solo mensaje para email inexistente, contraseña incorrecta o usuario dado de baja: si el mensaje
// cambiara según el caso, alcanzaría con probar mails para saber quién tiene cuenta.
export const MENSAJE_CREDENCIALES = 'El email o la contraseña no son correctos.'

export class DemasiadosIntentosError extends HttpError {
  readonly esperaSegundos: number

  constructor(esperaMs: number) {
    const esperaSegundos = Math.ceil(esperaMs / 1000)
    const minutos = Math.ceil(esperaSegundos / 60)
    super(
      429,
      `Hiciste demasiados intentos. Probá de nuevo en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`,
    )
    this.esperaSegundos = esperaSegundos
  }
}

export function crearServicioAuth(deps: {
  prisma: BaseAuth
  sesiones: ServicioSesiones
  limitePorEmail: LimiteIntentos
  limitePorIp: LimiteIntentos
}) {
  const { prisma, sesiones, limitePorEmail, limitePorIp } = deps

  // Si el email no existe, igual se verifica contra un hash: así la respuesta tarda lo mismo y el tiempo
  // tampoco delata qué emails están registrados.
  let hashFalso: Promise<string> | undefined
  const obtenerHashFalso = () => (hashFalso ??= hashPassword('contraseña-que-nunca-coincide'))

  async function contrasenaCorrecta(hash: string | undefined, contrasena: string) {
    try {
      return await verifyPassword(hash ?? (await obtenerHashFalso()), contrasena)
    } catch {
      return false
    }
  }

  return {
    async login(
      datos: LoginData,
      contexto: ContextoSesion & { ip: string },
    ): Promise<{ usuario: SesionUsuario; token: string }> {
      const email = datos.email.toLowerCase()
      const espera = Math.max(
        limitePorEmail.esperaRestante(email),
        limitePorIp.esperaRestante(contexto.ip),
      )
      if (espera > 0) throw new DemasiadosIntentosError(espera)

      const encontrado = await prisma.usuario.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, eliminado: false },
        select: {
          id: true,
          nombres: true,
          apellidos: true,
          email: true,
          tipoUsuario: true,
          contrasena: true,
        },
      })
      const valida = await contrasenaCorrecta(encontrado?.contrasena, datos.contrasena)

      if (!encontrado || !valida) {
        const bloqueo = Math.max(
          limitePorEmail.registrarFallo(email),
          limitePorIp.registrarFallo(contexto.ip),
        )
        if (bloqueo > 0) throw new DemasiadosIntentosError(bloqueo)
        throw new HttpError(401, MENSAJE_CREDENCIALES)
      }

      limitePorEmail.reiniciar(email)
      const { contrasena: _contrasena, ...usuario } = encontrado
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { ultimaConexion: new Date() },
      })
      const token = await sesiones.crear(usuario.id, contexto)
      return { usuario, token }
    },
  }
}
