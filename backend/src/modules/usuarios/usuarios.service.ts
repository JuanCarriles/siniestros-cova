import {
  siniestroActivoAsociado as siniestroActivo,
  seleccionSiniestrosActivos,
  paginaSiniestrosActivos,
} from '../siniestros/siniestros-asociados.ts'
import type { SesionUsuario } from '@cova/shared/schemas/auth'
import {
  motivoRestriccionUsuario,
  type AccionJerarquiaUsuario,
  type UsuarioAltaData,
  type UsuarioModificacionData,
} from '@cova/shared/schemas/usuarios-abm'
import type { Prisma } from '../../generated/prisma/client.ts'
import { hashPassword } from '../../lib/password.ts'
import { HttpError } from '../../utils/httpError.ts'

import {
  exigirEmailLibre,
  exigirProvincia,
  guardarDireccion,
  type TransaccionUsuarios as Transaccion,
} from './usuarios.datos.ts'

export type BaseUsuarios = Pick<Prisma.TransactionClient, 'usuario' | 'pais' | 'provincia'> & {
  transaccion<T>(trabajo: (tx: Transaccion) => Promise<T>): Promise<T>
}

// Selección explícita: ni el listado ni las respuestas de alta/modificación contienen contraseñas.
const detalle = {
  id: true,
  nombres: true,
  apellidos: true,
  documento: true,
  email: true,
  telefono: true,
  tipoUsuario: true,
  eliminado: true,
  fechaBaja: true,
  direccion: {
    select: {
      id: true,
      localidad: true,
      calle: true,
      pisoDepartamento: true,
      codigoPostal: true,
      idProvincia: true,
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
  _count: { select: { siniestros: { where: siniestroActivo } } },
} as const satisfies Prisma.UsuarioSelect
type Fila = Prisma.UsuarioGetPayload<{ select: typeof detalle }>
const aListado = ({ _count, ...fila }: Fila) => ({ ...fila, casosActivos: _count.siniestros })

async function buscar(tx: Pick<Transaccion, 'usuario'>, id: number) {
  const usuario = await tx.usuario.findUnique({ where: { id }, select: detalle })
  if (!usuario) throw new HttpError(404, 'El usuario no existe.')
  return usuario
}

async function autorizar(
  tx: Transaccion,
  actor: SesionUsuario,
  tipo: Fila['tipoUsuario'],
  accion: AccionJerarquiaUsuario = 'administrar',
) {
  const actual = await tx.usuario.findUnique({
    where: { id: actor.id },
    select: { tipoUsuario: true, eliminado: true },
  })
  if (!actual || actual.eliminado) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
  const motivo = motivoRestriccionUsuario(actual.tipoUsuario, tipo, accion)
  if (motivo) throw new HttpError(403, motivo, { campo: 'tipoUsuario' })
}

export function crearServicioUsuarios(base: BaseUsuarios) {
  return {
    async listar(incluirBajas: boolean) {
      const filas = await base.usuario.findMany({
        where: incluirBajas ? {} : { eliminado: false },
        select: detalle,
        orderBy: [{ eliminado: 'asc' }, { apellidos: 'asc' }, { nombres: 'asc' }, { id: 'asc' }],
      })
      return filas.map(aListado)
    },
    async catalogos() {
      const [paises, provincias] = await Promise.all([
        base.pais.findMany({
          where: { eliminado: false },
          select: { id: true, nombre: true },
          orderBy: { nombre: 'asc' },
        }),
        base.provincia.findMany({
          where: { eliminado: false, pais: { eliminado: false } },
          select: { id: true, nombre: true, idPais: true },
          orderBy: { nombre: 'asc' },
        }),
      ])
      return { paises, provincias }
    },
    async crear(actor: SesionUsuario, datos: UsuarioAltaData) {
      const motivo = motivoRestriccionUsuario(actor.tipoUsuario, datos.tipoUsuario, 'crear')
      if (motivo) throw new HttpError(403, motivo, { campo: 'tipoUsuario' })
      const contrasena = await hashPassword(datos.contrasena)
      return base.transaccion(async (tx) => {
        // El rol vigente viene de la base, nunca del cuerpo ni de una copia anterior de la sesión.
        await autorizar(tx, actor, datos.tipoUsuario, 'crear')
        await exigirEmailLibre(tx, datos.email)
        await exigirProvincia(tx, datos.direccion.idProvincia)
        const { direccion, ...personales } = datos
        const fila = await tx.usuario.create({
          data: { ...personales, contrasena, direccion: { create: direccion } },
          select: detalle,
        })
        return aListado(fila)
      })
    },
    async modificar(actor: SesionUsuario, id: number, datos: UsuarioModificacionData) {
      // '' y undefined conservan el hash. Nunca se devuelve el hash guardado al formulario.
      if (datos.tipoUsuario) {
        const motivo = motivoRestriccionUsuario(actor.tipoUsuario, datos.tipoUsuario, 'asignar')
        if (motivo) throw new HttpError(403, motivo, { campo: 'tipoUsuario' })
      }
      const hash = datos.contrasena ? await hashPassword(datos.contrasena) : undefined
      return base.transaccion(async (tx) => {
        const actual = await buscar(tx, id)
        await autorizar(tx, actor, actual.tipoUsuario)
        if (datos.tipoUsuario) await autorizar(tx, actor, datos.tipoUsuario, 'asignar')
        if (actual.eliminado)
          throw new HttpError(409, 'El usuario está dado de baja. Reactivalo para modificarlo.')
        if (datos.email) await exigirEmailLibre(tx, datos.email, id)
        if (datos.direccion)
          await exigirProvincia(tx, datos.direccion.idProvincia, actual.direccion.idProvincia)
        const { direccion, contrasena: _contrasena, ...personales } = datos
        let nuevaDireccion: { connect: { id: number } } | undefined
        if (direccion) {
          const propia = await guardarDireccion(tx, actual.direccion.id, direccion)
          nuevaDireccion = { connect: { id: propia.id } }
        }
        const fila = await tx.usuario.update({
          where: { id },
          data: {
            ...personales,
            ...(hash ? { contrasena: hash } : {}),
            ...(nuevaDireccion ? { direccion: nuevaDireccion } : {}),
          },
          select: detalle,
        })
        if (
          hash ||
          (datos.email && datos.email !== actual.email) ||
          (datos.tipoUsuario && datos.tipoUsuario !== actual.tipoUsuario)
        ) {
          await tx.sesion.deleteMany({ where: { idUsuario: id } })
          await tx.recuperacionContrasena.deleteMany({ where: { idUsuario: id } })
        }
        return aListado(fila)
      })
    },
    async siniestrosActivos(actor: SesionUsuario, id: number, pagina: number) {
      return base.transaccion(async (tx) => {
        const actual = await buscar(tx, id)
        await autorizar(tx, actor, actual.tipoUsuario)
        const fila = await tx.usuario.findUnique({
          where: { id },
          select: seleccionSiniestrosActivos(pagina),
        })
        if (!fila) throw new HttpError(404, 'El usuario no existe.')
        return paginaSiniestrosActivos(fila, pagina)
      })
    },
    async darDeBaja(actor: SesionUsuario, id: number) {
      return base.transaccion(async (tx) => {
        const actual = await buscar(tx, id)
        await autorizar(tx, actor, actual.tipoUsuario)
        if (actual.eliminado) throw new HttpError(409, 'El usuario ya está dado de baja.')
        // El conteo y el cambio de estado comparten transacción serializable y predicado SQL.
        const resultado = await tx.usuario.updateMany({
          where: { id, eliminado: false, siniestros: { none: siniestroActivo } },
          data: { eliminado: true, fechaBaja: new Date() },
        })
        if (resultado.count !== 1) {
          const actualizado = await buscar(tx, id)
          throw new HttpError(
            409,
            `No se puede dar de baja: tiene ${actualizado._count.siniestros} ${actualizado._count.siniestros === 1 ? 'caso activo. Reasignalo' : 'casos activos. Reasignalos'} antes de continuar.`,
            { codigo: 'USUARIO_CON_SINIESTROS', casosActivos: actualizado._count.siniestros },
          )
        }
        await tx.sesion.deleteMany({ where: { idUsuario: id } })
        await tx.recuperacionContrasena.deleteMany({ where: { idUsuario: id } })
      })
    },
    async reactivar(actor: SesionUsuario, id: number) {
      return base.transaccion(async (tx) => {
        const actual = await buscar(tx, id)
        await autorizar(tx, actor, actual.tipoUsuario)
        if (!actual.eliminado) throw new HttpError(409, 'El usuario ya está activo.')
        await tx.usuario.update({ where: { id }, data: { eliminado: false, fechaBaja: null } })
      })
    },
  }
}
