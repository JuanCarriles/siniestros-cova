import { Router, type RequestHandler } from 'express'
import type { SesionUsuario } from '@cova/shared/schemas/auth'
import { idSchema } from '@cova/shared/schemas/comunes'
import {
  confirmarBajaSiniestroSchema,
  confirmarSiniestroSchema,
  filtrosSiniestrosSchema,
} from '@cova/shared/schemas/siniestros'
import { claveArchivoSchema } from '@cova/shared/schemas/comunes'
import { crearSiniestroSchema, datosCasoSchema } from '@cova/shared/schemas/siniestros-alta'
import { requerirRol, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import { nombreOriginalUtf8, recibirArchivo } from '../../middlewares/recibir-archivo.ts'
import { HttpError } from '../../utils/httpError.ts'
import type { crearServicioCrearSiniestro } from './siniestros-alta-crear.service.ts'
import type { crearServicioAltaSiniestros } from './siniestros-alta.service.ts'
import type { crearServicioBajasSiniestros } from './siniestros-bajas.service.ts'
import type { crearServicioSiniestros } from './siniestros.service.ts'

/** Lectura de cada pestaña de la ficha (CU-10). Cada historia suma sus acciones en su propio servicio. */
type PestanaFicha = {
  listar: (usuario: SesionUsuario, idSiniestro: number) => Promise<unknown>
}
export const PESTANAS_FICHA = [
  'vehiculos',
  'abogados',
  'peritos',
  'novedades',
  'documentos',
  'historial',
] as const

// CU-09. Todos los roles; el servicio limita al gestor a sus siniestros (RF-17).
// GET /api/siniestros?pagina=&porPagina=&q=&estado=&aseguradora=&gestor=&activos=&bajas=&orden=
// GET /api/siniestros/opciones
// GET /api/siniestros/:id/partes
// Ficha (CU-10, E5-01), con el mismo control de acceso:
// GET /api/siniestros/:id             cabecera, datos del caso y cantidades de cada pestaña
// GET /api/siniestros/:id/vehiculos   vehículos con titular y ocupantes, y personas fuera de los vehículos
// GET /api/siniestros/:id/abogados | peritos | novedades | documentos | historial
// Alta (solo administrador y superadministrador):
// GET  /api/siniestros/alta/opciones
// POST /api/siniestros/alta/datos-caso   valida el paso 1 (204 o el error con su campo)
// POST   /api/siniestros/alta/documentos  sube un documento del alta a R2 (multipart, campo "archivo")
// DELETE /api/siniestros/alta/documentos  { clave } lo quita
// POST   /api/siniestros/alta             crea el siniestro con todo lo cargado y avisa al asignado
export function crearSiniestrosRouter(deps: {
  operaciones: ReturnType<typeof crearServicioBajasSiniestros>
  servicio: ReturnType<typeof crearServicioSiniestros>
  alta: ReturnType<typeof crearServicioAltaSiniestros>
  creacion: ReturnType<typeof crearServicioCrearSiniestro>
  ficha: Record<(typeof PESTANAS_FICHA)[number], PestanaFicha>
  requerirSesion: RequestHandler
}) {
  const { servicio, alta, creacion, operaciones, ficha, requerirSesion } = deps
  const router = Router()
  router.use(requerirSesion, requerirRol('GESTOR', 'ADMINISTRADOR', 'SUPER_ADMINISTRADOR'))

  const soloAdministracion = requerirRol('ADMINISTRADOR', 'SUPER_ADMINISTRADOR')
  router.get('/alta/opciones', soloAdministracion, async (_req, res) => {
    res.json(await alta.opciones())
  })
  router.post('/alta/datos-caso', soloAdministracion, async (req, res) => {
    await alta.validarDatosCaso(datosCasoSchema.parse(req.body))
    res.status(204).end()
  })
  router.post('/alta/documentos', soloAdministracion, recibirArchivo(), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Elegí el archivo que querés cargar.')
    res.status(201).json(
      await creacion.subirDocumento(usuarioDeSesion(req), {
        nombreOriginal: nombreOriginalUtf8(req.file.originalname),
        contenido: req.file.buffer,
      }),
    )
  })
  router.delete('/alta/documentos', soloAdministracion, async (req, res) => {
    const clave = claveArchivoSchema.parse((req.body as { clave?: unknown } | undefined)?.clave)
    await creacion.quitarDocumento(usuarioDeSesion(req), clave)
    res.status(204).end()
  })
  router.post('/alta', soloAdministracion, async (req, res) => {
    res
      .status(201)
      .json(await creacion.crear(usuarioDeSesion(req), crearSiniestroSchema.parse(req.body)))
  })

  router.get('/', async (req, res) => {
    res.json(await servicio.listar(usuarioDeSesion(req), filtrosSiniestrosSchema.parse(req.query)))
  })

  router.get('/opciones', async (req, res) => {
    res.json(await servicio.opciones(usuarioDeSesion(req)))
  })

  router.patch(
    '/:id/baja',
    requerirRol('ADMINISTRADOR', 'SUPER_ADMINISTRADOR'),
    async (req, res) => {
      confirmarBajaSiniestroSchema.parse(req.body ?? {})
      await operaciones.darDeBaja(usuarioDeSesion(req), idSchema.parse(req.params.id))
      res.status(204).end()
    },
  )
  router.patch('/:id/reactivacion', soloAdministracion, async (req, res) => {
    confirmarBajaSiniestroSchema.parse(req.body ?? {})
    await operaciones.reactivar(usuarioDeSesion(req), idSchema.parse(req.params.id))
    res.status(204).end()
  })
  router.delete('/:id', requerirRol('ADMINISTRADOR', 'SUPER_ADMINISTRADOR'), async (req, res) => {
    await operaciones.eliminar(
      usuarioDeSesion(req),
      idSchema.parse(req.params.id),
      confirmarSiniestroSchema.parse(req.body),
    )
    res.status(204).end()
  })
  router.get('/:id', async (req, res) => {
    res.json(await servicio.obtener(usuarioDeSesion(req), idSchema.parse(req.params.id)))
  })

  router.get('/:id/partes', async (req, res) => {
    res.json(await servicio.partes(usuarioDeSesion(req), idSchema.parse(req.params.id)))
  })

  for (const pestana of PESTANAS_FICHA) {
    router.get(`/:id/${pestana}`, async (req, res) => {
      res.json(await ficha[pestana].listar(usuarioDeSesion(req), idSchema.parse(req.params.id)))
    })
  }

  return router
}
