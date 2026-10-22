import type {
  PerfilActualizacionData,
  PerfilContrasenaData,
  PerfilVerificarData,
} from '@cova/shared/schemas/perfil'
import type { Prisma } from '../../generated/prisma/client.ts'
import type { BaseUsuarios } from '../usuarios/usuarios.service.ts'
import { crearServicioUsuarios } from '../usuarios/usuarios.service.ts'
import { exigirEmailLibre, exigirProvincia, guardarDireccion } from '../usuarios/usuarios.datos.ts'
import { hashPassword, verifyPassword } from '../../lib/password.ts'
import { hashToken } from '../auth/sesiones.service.ts'
import { crearLimiteIntentos } from '../auth/limite-intentos.ts'
import { HttpError } from '../../utils/httpError.ts'

const activo = {
  eliminado: false,
  estadoSiniestro: { esCierre: false },
} satisfies Prisma.SiniestroWhereInput
const datosPersonales = {
  id: true,
  nombres: true,
  apellidos: true,
  documento: true,
  email: true,
  telefono: true,
  tipoUsuario: true,
  eliminado: true,
  fechaBaja: true,
  ultimaConexion: true,
  direccion: {
    select: {
      id: true,
      idProvincia: true,
      localidad: true,
      calle: true,
      codigoPostal: true,
      pisoDepartamento: true,
      provincia: {
        select: {
          id: true,
          nombre: true,
          idPais: true,
          pais: { select: { id: true, nombre: true } },
        },
      },
    },
  },
} as const satisfies Prisma.UsuarioSelect
type Tx = Parameters<Parameters<BaseUsuarios['transaccion']>[0]>[0]
// La verificación previa solo habilita la interfaz. Cada escritura vuelve a comprobar la contraseña
// vigente dentro de la transacción, sin permisos guardados en memoria ni vigencias adicionales.
export function crearServicioPerfil({
  base,
  enviarAvisoCambio,
  ahora = Date.now,
}: {
  base: BaseUsuarios
  enviarAvisoCambio: (email: string) => Promise<void>
  ahora?: () => number
}) {
  const limites = crearLimiteIntentos({ maximo: 5, ventanaMs: 600_000, bloqueoMs: 600_000, ahora })
  const limitesIp = crearLimiteIntentos({
    maximo: 30,
    ventanaMs: 600_000,
    bloqueoMs: 600_000,
    ahora,
  })

  async function usuarioConSesion(tx: Tx, id: number, clave: string) {
    const [usuario, sesion] = await Promise.all([
      tx.usuario.findUnique({ where: { id }, select: { ...datosPersonales, contrasena: true } }),
      tx.sesion.findUnique({
        where: { tokenHash: clave },
        select: { idUsuario: true, fechaVencimiento: true },
      }),
    ])
    if (
      !usuario ||
      usuario.eliminado ||
      !sesion ||
      sesion.idUsuario !== id ||
      sesion.fechaVencimiento.getTime() <= ahora()
    )
      throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
    return usuario
  }

  async function comprobarContrasena(id: number, hash: string, contrasena: string, ip: string) {
    const espera = Math.max(limites.esperaRestante(String(id)), limitesIp.esperaRestante(ip))
    if (espera > 0)
      throw new HttpError(429, 'Hiciste demasiados intentos. Probá de nuevo en unos minutos.')
    if (!(await verifyPassword(hash, contrasena))) {
      const bloqueo = Math.max(limites.registrarFallo(String(id)), limitesIp.registrarFallo(ip))
      throw new HttpError(
        bloqueo > 0 ? 429 : 400,
        bloqueo > 0
          ? 'Hiciste demasiados intentos. Probá de nuevo en unos minutos.'
          : 'La contraseña no es correcta.',
      )
    }
    limites.reiniciar(String(id))
  }

  async function conContrasena<T>(
    id: number,
    token: string,
    contrasena: string,
    ip: string,
    trabajo: (tx: Tx, usuario: Awaited<ReturnType<typeof usuarioConSesion>>) => Promise<T>,
  ) {
    return base.transaccion(async (tx) => {
      const usuario = await usuarioConSesion(tx, id, hashToken(token))
      await comprobarContrasena(id, usuario.contrasena, contrasena, ip)
      return trabajo(tx, usuario)
    })
  }

  return {
    async obtener(id: number) {
      const t = ahora()
      const limite = new Date(t - 72 * 3_600_000)
      // RF-19: más de 72 h sin movimiento; la bandera almacenada puede haber quedado desactualizada.
      const demorado = {
        ...activo,
        OR: [
          { fechaUltimoMovimiento: { lt: limite } },
          { fechaUltimoMovimiento: null, fechaAsignacion: { lt: limite } },
        ],
      } satisfies Prisma.SiniestroWhereInput
      const usuario = await base.usuario.findUnique({
        where: { id },
        select: {
          ...datosPersonales,
          _count: { select: { siniestros: { where: activo } } },
          siniestros: {
            where: demorado,
            select: {
              id: true,
              numeroSiniestro: true,
              fechaUltimoMovimiento: true,
              fechaAsignacion: true,
              aseguradora: { select: { nombre: true } },
            },
            orderBy: [{ fechaUltimoMovimiento: 'asc' }, { id: 'asc' }],
          },
        },
      })
      if (!usuario || usuario.eliminado)
        throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
      const { _count, siniestros, ...personales } = usuario
      return {
        ...personales,
        casosActivos: _count.siniestros,
        casosDemorados: siniestros.length,
        demorados: siniestros.map((caso) => ({
          id: caso.id,
          numeroSiniestro: caso.numeroSiniestro,
          aseguradora: caso.aseguradora.nombre,
          diasSinMovimiento: Math.floor(
            (t - (caso.fechaUltimoMovimiento ?? caso.fechaAsignacion).getTime()) / 86_400_000,
          ),
        })),
      }
    },
    catalogos: () => crearServicioUsuarios(base).catalogos(),
    async verificar(id: number, token: string, datos: PerfilVerificarData, ip = '') {
      await conContrasena(id, token, datos.contrasena, ip, () => Promise.resolve())
    },
    async modificar(id: number, token: string, datos: PerfilActualizacionData, ip = '') {
      await conContrasena(id, token, datos.contrasenaActual, ip, async (tx, usuario) => {
        await exigirEmailLibre(tx, datos.email, id)
        await exigirProvincia(tx, datos.direccion.idProvincia, usuario.direccion.idProvincia)
        const { direccion, contrasenaActual: _contrasenaActual, ...personales } = datos
        const propia = await guardarDireccion(tx, usuario.direccion.id, direccion)
        await tx.usuario.update({ where: { id }, data: { ...personales, idDireccion: propia.id } })
        if (datos.email !== usuario.email) {
          await tx.sesion.deleteMany({
            where: { idUsuario: id, tokenHash: { not: hashToken(token) } },
          })
          await tx.recuperacionContrasena.deleteMany({ where: { idUsuario: id } })
        }
      })
    },
    async cambiarContrasena(id: number, token: string, datos: PerfilContrasenaData, ip = '') {
      const email = await conContrasena(
        id,
        token,
        datos.contrasenaActual,
        ip,
        async (tx, usuario) => {
          const hash = await hashPassword(datos.contrasena)
          await tx.usuario.update({ where: { id }, data: { contrasena: hash } })
          // El cambio, las recuperaciones y TODAS las sesiones se invalidan juntos, incluida la actual.
          await tx.sesion.deleteMany({ where: { idUsuario: id } })
          await tx.recuperacionContrasena.deleteMany({ where: { idUsuario: id } })
          return usuario.email
        },
      )
      // Solo después del commit: un correo fallido no debe deshacer el cambio ni conservar sesiones.
      try {
        await enviarAvisoCambio(email)
        return { correoEnviado: true }
      } catch {
        console.error('No se pudo enviar el aviso de cambio de contraseña.')
        return { correoEnviado: false }
      }
    },
  }
}
