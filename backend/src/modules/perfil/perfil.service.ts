import type {
  AlcancePerfil,
  PerfilDatosData,
  PerfilVerificarData,
} from '@cova/shared/schemas/perfil'
import type { Prisma } from '../../generated/prisma/client.ts'
import type { BaseUsuarios } from '../usuarios/usuarios.service.ts'
import { crearServicioUsuarios } from '../usuarios/usuarios.service.ts'
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
type Permiso = {
  idUsuario: number
  alcance: AlcancePerfil
  hash: string
  vence: number
  ocupado: boolean
}
const requerida = () =>
  new HttpError(403, 'Confirmá tu contraseña para habilitar la edición.', {
    codigo: 'PERFIL_REQUIERE_VERIFICACION',
  })

// Permisos efímeros del único proceso Node, ligados a la sesión y a la contraseña vigente.
// Un reinicio los invalida de forma segura; nunca se guarda la contraseña ni se entrega un token al frontend.
export function crearServicioPerfil({
  base,
  ahora = Date.now,
}: {
  base: BaseUsuarios
  ahora?: () => number
}) {
  const permisos = new Map<string, Permiso>()
  const limites = crearLimiteIntentos({ maximo: 5, ventanaMs: 600_000, bloqueoMs: 600_000, ahora })
  const limitesIp = crearLimiteIntentos({
    maximo: 30,
    ventanaMs: 600_000,
    bloqueoMs: 600_000,
    ahora,
  })
  const vigenciaMs = 10 * 60_000

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

  async function conPermiso<T>(
    id: number,
    token: string,
    alcance: AlcancePerfil,
    trabajo: (tx: Tx, usuario: Awaited<ReturnType<typeof usuarioConSesion>>) => Promise<T>,
  ) {
    const clave = hashToken(token)
    const permiso = permisos.get(clave)
    if (
      !permiso ||
      permiso.idUsuario !== id ||
      permiso.alcance !== alcance ||
      permiso.vence <= ahora() ||
      permiso.ocupado
    )
      throw requerida()
    permiso.ocupado = true
    try {
      const resultado = await base.transaccion(async (tx) => {
        const usuario = await usuarioConSesion(tx, id, clave)
        if (permiso.hash !== hashToken(usuario.contrasena) || permiso.vence <= ahora())
          throw requerida()
        return trabajo(tx, usuario)
      })
      if (permisos.get(clave) === permiso) permisos.delete(clave)
      return resultado
    } catch (error) {
      if (error instanceof HttpError && [401, 403].includes(error.status)) permisos.delete(clave)
      throw error
    } finally {
      permiso.ocupado = false
    }
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
      const clave = hashToken(token)
      permisos.delete(clave)
      const espera = Math.max(limites.esperaRestante(String(id)), limitesIp.esperaRestante(ip))
      if (espera > 0)
        throw new HttpError(429, 'Hiciste demasiados intentos. Probá de nuevo en unos minutos.')
      const usuario = await base.usuario.findUnique({
        where: { id },
        select: { contrasena: true, eliminado: true },
      })
      if (!usuario || usuario.eliminado)
        throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
      if (!(await verifyPassword(usuario.contrasena, datos.contrasena))) {
        const bloqueo = Math.max(limites.registrarFallo(String(id)), limitesIp.registrarFallo(ip))
        throw new HttpError(
          bloqueo > 0 ? 429 : 400,
          bloqueo > 0
            ? 'Hiciste demasiados intentos. Probá de nuevo en unos minutos.'
            : 'La contraseña no es correcta.',
        )
      }
      await base.transaccion(async (tx) => {
        const actual = await usuarioConSesion(tx, id, clave)
        if (actual.contrasena !== usuario.contrasena) throw requerida()
      })
      limites.reiniciar(String(id))
      for (const [k, permiso] of permisos) if (permiso.vence <= ahora()) permisos.delete(k)
      if (permisos.size >= 10_000) permisos.delete(permisos.keys().next().value!)
      permisos.set(clave, {
        idUsuario: id,
        alcance: datos.alcance,
        hash: hashToken(usuario.contrasena),
        vence: ahora() + vigenciaMs,
        ocupado: false,
      })
      return { vigenciaSegundos: vigenciaMs / 1000 }
    },
    bloquear(token: string) {
      permisos.delete(hashToken(token))
    },
    async modificar(id: number, token: string, datos: PerfilDatosData) {
      await conPermiso(id, token, 'datos', async (tx, usuario) => {
        const repetido = await tx.usuario.findFirst({
          where: { id: { not: id }, email: { equals: datos.email, mode: 'insensitive' } },
          select: { id: true },
        })
        if (repetido)
          throw new HttpError(409, 'Ya existe un usuario con ese email.', { campo: 'email' })
        if (datos.direccion.idProvincia !== usuario.direccion.idProvincia) {
          const provincia = await tx.provincia.findFirst({
            where: {
              id: datos.direccion.idProvincia,
              eliminado: false,
              pais: { eliminado: false },
            },
            select: { id: true },
          })
          if (!provincia)
            throw new HttpError(409, 'La provincia elegida no está disponible.', {
              campo: 'direccion.idProvincia',
            })
        }
        const vinculada = await tx.direccion.findUniqueOrThrow({
          where: { id: usuario.direccion.id },
          select: {
            _count: { select: { usuarios: true, siniestros: true } },
            perito: { select: { id: true } },
            personaInvolucrada: { select: { id: true } },
          },
        })
        const compartida =
          vinculada._count.usuarios > 1 ||
          vinculada._count.siniestros > 0 ||
          vinculada.perito !== null ||
          vinculada.personaInvolucrada !== null
        const { direccion, ...personales } = datos
        const propia = compartida
          ? await tx.direccion.create({ data: direccion, select: { id: true } })
          : await tx.direccion.update({
              where: { id: usuario.direccion.id },
              data: direccion,
              select: { id: true },
            })
        await tx.usuario.update({ where: { id }, data: { ...personales, idDireccion: propia.id } })
        if (datos.email !== usuario.email) {
          await tx.sesion.deleteMany({
            where: { idUsuario: id, tokenHash: { not: hashToken(token) } },
          })
          await tx.recuperacionContrasena.deleteMany({ where: { idUsuario: id } })
        }
      })
    },
    async cambiarContrasena(id: number, token: string, contrasena: string) {
      // No calcular hashes costosos si no hubo verificación previa de esta sesión.
      const permiso = permisos.get(hashToken(token))
      if (
        !permiso ||
        permiso.idUsuario !== id ||
        permiso.alcance !== 'contrasena' ||
        permiso.vence <= ahora()
      )
        throw requerida()
      const hash = await hashPassword(contrasena)
      await conPermiso(id, token, 'contrasena', async (tx) => {
        await tx.usuario.update({ where: { id }, data: { contrasena: hash } })
        await tx.sesion.deleteMany({
          where: { idUsuario: id, tokenHash: { not: hashToken(token) } },
        })
        await tx.recuperacionContrasena.deleteMany({ where: { idUsuario: id } })
      })
    },
  }
}
