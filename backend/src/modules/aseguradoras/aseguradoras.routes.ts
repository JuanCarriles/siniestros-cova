import { Router, type RequestHandler } from 'express'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import { aseguradoraSchema, aseguradoraUpdateSchema } from '@cova/shared/schemas/aseguradoras'
import { idSchema } from '@cova/shared/schemas/comunes'
import { getPrisma } from '../../lib/prisma.ts'
import { env } from '../../config/env.ts'
import { HttpError } from '../../utils/httpError.ts'
import { crearServicioAseguradoras } from './aseguradoras.service.ts'

// Acceso local para probar la vista con PostgreSQL antes de E1-01.
// No acepta IDs ni roles del navegador y nunca se habilita en producción.
export const autorizarVistaPrevia: RequestHandler = (req, res, next) => {
  try {
    const origen = req.socket.remoteAddress
    const local = origen === '::1' || origen === '127.0.0.1' || origen === '::ffff:127.0.0.1'
    if (env.NODE_ENV !== 'development' || !local) {
      throw new HttpError(404, 'La vista previa no está disponible')
    }
    res.locals.vistaPreviaAseguradoras = true
    next()
  } catch (error) {
    next(error)
  }
}

// E1-01 debe establecer usuarioId desde una sesión comprobada por el servidor.
// Sin esa identidad, todas las operaciones quedan cerradas; nunca se lee un rol del cliente.
const autorizar =
  (prismaFactory: () => PrismaClient): RequestHandler =>
  async (_req, res, next) => {
    try {
      if (res.locals.vistaPreviaAseguradoras === true) {
        next()
        return
      }
      const usuarioId: unknown = res.locals.usuarioId
      if (typeof usuarioId !== 'number' || !Number.isInteger(usuarioId) || usuarioId < 1) {
        throw new HttpError(401, 'Iniciá sesión para administrar aseguradoras')
      }
      const usuario = await prismaFactory().usuario.findFirst({
        where: { id: usuarioId, eliminado: false },
        select: { tipoUsuario: true },
      })
      if (!usuario) throw new HttpError(401, 'La sesión ya no es válida')
      if (!['ADMINISTRADOR', 'SUPER_ADMINISTRADOR'].includes(usuario.tipoUsuario)) {
        throw new HttpError(403, 'No tenés permiso para administrar aseguradoras')
      }
      next()
    } catch (error) {
      next(error)
    }
  }

function idDe(params: { id?: string | string[] }) {
  return idSchema.parse(params.id)
}

export function crearAseguradorasRouter(prismaFactory: () => PrismaClient = getPrisma) {
  const router = Router()
  router.use(autorizar(prismaFactory))
  router.get('/', async (req, res) => {
    const filtro = req.query.incluirBajas
    if (filtro !== undefined && filtro !== 'true' && filtro !== 'false') {
      throw new HttpError(400, 'El filtro incluirBajas debe ser true o false')
    }
    res.json(await crearServicioAseguradoras(prismaFactory()).listar(filtro === 'true'))
  })

  router.post('/', async (req, res) => {
    const datos = aseguradoraSchema.parse(req.body)
    res.status(201).json(await crearServicioAseguradoras(prismaFactory()).crear(datos))
  })

  router.patch('/:id', async (req, res) => {
    const datos = aseguradoraUpdateSchema.parse(req.body)
    res.json(await crearServicioAseguradoras(prismaFactory()).modificar(idDe(req.params), datos))
  })

  router.patch('/:id/baja', async (req, res) => {
    await crearServicioAseguradoras(prismaFactory()).darDeBaja(idDe(req.params))
    res.status(204).end()
  })

  router.patch('/:id/reactivacion', async (req, res) => {
    await crearServicioAseguradoras(prismaFactory()).reactivar(idDe(req.params))
    res.status(204).end()
  })
  return router
}

export const aseguradorasRouter = crearAseguradorasRouter()
