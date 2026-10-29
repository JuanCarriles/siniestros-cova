import { motivoFalloCorreo } from '../../lib/correo-resend.ts'
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import type { Prisma } from '../../generated/prisma/client.ts'
import { hashPassword } from '../../lib/password.ts'
import { HttpError } from '../../utils/httpError.ts'
import { hashToken } from './sesiones.service.ts'
import { crearLimiteIntentos } from './limite-intentos.ts'

type Transaccion = Pick<Prisma.TransactionClient, 'usuario' | 'sesion' | 'recuperacionContrasena'>
export type BaseRecuperacion = {
  transaccion<T>(trabajo: (tx: Transaccion) => Promise<T>): Promise<T>
}
export type CorreoRecuperacion = { email: string; codigo: string; minutos: number }

export const MENSAJE_RECUPERACION =
  'Si el correo está registrado y activo, recibirás un código para recuperar tu contraseña.'
export const MENSAJE_CODIGO = 'El código no es válido o venció. Revisalo o solicitá uno nuevo.'
export const MENSAJE_TOKEN = 'La autorización no es válida o venció. Solicitá un código nuevo.'
export const REENVIO_SEGUNDOS = 60
const MAX_INTENTOS = 5
const MINUTO = 60_000

// El secreto de este HMAC es el desafío aleatorio de la cookie, que no se guarda en la base.
// Una copia de la base no permite probar offline el millón de códigos posibles.
function hashCodigo(desafio: string, codigo: string): string {
  return createHmac('sha256', desafio).update(codigo).digest('hex')
}

export function crearServicioRecuperacion(deps: {
  base: BaseRecuperacion
  enviarCorreo: (datos: CorreoRecuperacion) => Promise<void>
  minutos: number
  ahora?: () => Date
}) {
  const { base, enviarCorreo, minutos, ahora = () => new Date() } = deps
  const opciones = {
    ventanaMs: 10 * MINUTO,
    bloqueoMs: 10 * MINUTO,
    ahora: () => ahora().getTime(),
  }
  // Límites por IP y email: también se aplican a cuentas inexistentes o dadas de baja.
  // Estos límites viven en el único proceso actual; los intentos de cada código persisten en PostgreSQL.
  const solicitudesIp = crearLimiteIntentos({ ...opciones, maximo: 20 })
  const solicitudesEmail = crearLimiteIntentos({ ...opciones, maximo: 5 })
  const reenvios = crearLimiteIntentos({
    ...opciones,
    maximo: 1,
    bloqueoMs: MINUTO,
    ventanaMs: MINUTO,
  })
  const verificacionesIp = crearLimiteIntentos({ ...opciones, maximo: 50 })
  const cambiosIp = crearLimiteIntentos({ ...opciones, maximo: 10 })

  function consumir(limite: ReturnType<typeof crearLimiteIntentos>, clave: string): boolean {
    if (limite.esperaRestante(clave) > 0) return false
    limite.registrarFallo(clave)
    return true
  }

  return {
    duracionMs: minutos * MINUTO,

    async solicitar(emailEntrada: string, ip: string, actual = ''): Promise<string | null> {
      const email = emailEntrada.toLowerCase()
      if (!consumir(solicitudesIp, ip)) return null
      if (reenvios.esperaRestante(email) > 0 || !consumir(solicitudesEmail, email)) return null
      consumir(reenvios, email)
      const t = ahora()
      // Se devuelve el mismo formato de desafío para cuentas existentes e inexistentes.
      const desafio = randomBytes(32).toString('base64url')
      const codigo = randomInt(0, 1_000_000).toString().padStart(6, '0')
      const destinatario = await base.transaccion(async (tx) => {
        await tx.recuperacionContrasena.deleteMany({ where: { fechaVencimiento: { lte: t } } })
        const usuario = await tx.usuario.findFirst({
          where: { email: { equals: email, mode: 'insensitive' }, eliminado: false },
          select: { id: true, email: true },
        })
        if (!usuario) return null
        const anterior = await tx.recuperacionContrasena.findUnique({
          where: { idUsuario: usuario.id },
        })
        if (anterior && t.getTime() - anterior.fechaCreacion.getTime() < MINUTO) return false
        const data = {
          tokenHash: hashToken(desafio),
          codigoHash: hashCodigo(desafio, codigo),
          intentos: 0,
          fechaCreacion: t,
          fechaVencimiento: new Date(t.getTime() + minutos * MINUTO),
          fechaVerificacion: null,
        }
        await tx.recuperacionContrasena.upsert({
          where: { idUsuario: usuario.id },
          create: { idUsuario: usuario.id, ...data },
          update: data,
        })
        return usuario.email
      })
      if (destinatario === false) return actual || desafio
      if (destinatario) {
        // No esperar al proveedor evita que el tiempo de envío revele si la cuenta existe.
        // El error se registra sin correo, código, tokens ni credenciales.
        // El motivo (falta la clave, Resend rechazó con tal estado, tiempo agotado) no incluye datos sensibles
        void enviarCorreo({ email: destinatario, codigo, minutos }).catch((error: unknown) => {
          console.error(`No se pudo enviar el correo de recuperación: ${motivoFalloCorreo(error)}`)
        })
      }
      return desafio
    },

    async verificar(desafio: string, codigo: string, ip: string): Promise<string> {
      if (!consumir(verificacionesIp, ip)) throw new HttpError(400, MENSAJE_CODIGO)
      const token = randomBytes(32).toString('base64url')
      const t = ahora()
      const valida = await base.transaccion(async (tx) => {
        const registro = await tx.recuperacionContrasena.findUnique({
          where: { tokenHash: hashToken(desafio) },
        })
        if (
          !registro ||
          registro.fechaVencimiento <= t ||
          registro.fechaVerificacion ||
          registro.intentos >= MAX_INTENTOS ||
          !registro.codigoHash
        )
          return false
        const usuario = await tx.usuario.findFirst({
          where: { id: registro.idUsuario, eliminado: false },
          select: { id: true },
        })
        if (!usuario) return false
        const correcto = timingSafeEqual(
          Buffer.from(registro.codigoHash, 'hex'),
          Buffer.from(hashCodigo(desafio, codigo), 'hex'),
        )
        if (!correcto) {
          await tx.recuperacionContrasena.update({
            where: { id: registro.id },
            data: { intentos: { increment: 1 } },
          })
          return false
        }
        await tx.recuperacionContrasena.update({
          where: { id: registro.id },
          data: { tokenHash: hashToken(token), codigoHash: null, fechaVerificacion: t },
        })
        return true
      })
      if (!valida) throw new HttpError(400, MENSAJE_CODIGO)
      return token
    },

    async cambiar(token: string, contrasena: string, ip: string): Promise<void> {
      if (!consumir(cambiosIp, ip)) throw new HttpError(400, MENSAJE_TOKEN)
      const t = ahora()
      const tokenHash = hashToken(token)
      // Primero comprobar la autorización para no ejecutar Argon2 con tokens inventados.
      const habilitado = await base.transaccion(async (tx) => {
        const registro = await tx.recuperacionContrasena.findUnique({ where: { tokenHash } })
        return !!registro?.fechaVerificacion && registro.fechaVencimiento > t
      })
      if (!habilitado) throw new HttpError(400, MENSAJE_TOKEN)
      const hash = await hashPassword(contrasena)
      const cambiada = await base.transaccion(async (tx) => {
        const registro = await tx.recuperacionContrasena.findUnique({ where: { tokenHash } })
        if (!registro?.fechaVerificacion || registro.fechaVencimiento <= ahora()) return false
        const usuario = await tx.usuario.updateMany({
          where: { id: registro.idUsuario, eliminado: false },
          data: { contrasena: hash },
        })
        if (usuario.count !== 1) return false
        // Contraseña, consumo del token y revocación de sesiones son una única transacción.
        await tx.sesion.deleteMany({ where: { idUsuario: registro.idUsuario } })
        await tx.recuperacionContrasena.deleteMany({ where: { idUsuario: registro.idUsuario } })
        return true
      })
      if (!cambiada) throw new HttpError(400, MENSAJE_TOKEN)
    },
  }
}
