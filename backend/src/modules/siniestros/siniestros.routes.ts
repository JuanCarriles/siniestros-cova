import type { crearServicioArchivosDocumento } from '../documentos/documentos-archivos.service.ts'
import { Router, type RequestHandler } from 'express'
import { idCargaDocumentoSchema, compresionDocumentoSchema } from '@cova/shared/schemas/documentos'
import type { SesionUsuario } from '@cova/shared/schemas/auth'
import { idSchema } from '@cova/shared/schemas/comunes'
import {
  confirmarBajaSiniestroSchema,
  confirmarSiniestroSchema,
  filtrosSiniestrosSchema,
} from '@cova/shared/schemas/siniestros'
import { claveArchivoSchema } from '@cova/shared/schemas/comunes'
import { novedadSchema } from '@cova/shared/schemas/novedades'
import {
  abogadoFichaSchema,
  agregarPersonaSchema,
  modificarAbogadoSchema,
  modificarPeritoSchema,
  modificarPersonaSchema,
  modificarVehiculoSchema,
} from '@cova/shared/schemas/partes-siniestro'
import {
  crearSiniestroSchema,
  datosCasoSchema,
  peritoAltaSchema,
  vehiculoAltaSchema,
} from '@cova/shared/schemas/siniestros-alta'
import { requerirRol, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import { nombreOriginalUtf8, recibirArchivo } from '../../middlewares/recibir-archivo.ts'
import { HttpError } from '../../utils/httpError.ts'
import type { crearServicioDocumentosGestion } from '../documentos/documentos-gestion.service.ts'
import { decodificarDocumento } from '../documentos/transporte-documento.ts'
import type { crearServicioCrearSiniestro } from './siniestros-alta-crear.service.ts'
import type { crearServicioAltaSiniestros } from './siniestros-alta.service.ts'
import type { crearServicioBajasSiniestros } from './siniestros-bajas.service.ts'
import type { crearServicioSiniestros } from './siniestros.service.ts'
import type { crearServicioAbogadosGestion } from './abogados/abogados-gestion.service.ts'
import type { crearServicioPeritosGestion } from './peritos/peritos-gestion.service.ts'
import type { crearServicioPersonasGestion } from './personas/personas-gestion.service.ts'
import type { crearServicioVehiculosGestion } from './vehiculos/vehiculos-gestion.service.ts'
import { cambiarEstadoSiniestroSchema } from '@cova/shared/schemas/cambio-estado-siniestro'
import type { crearServicioEstadoSiniestro } from './siniestros-estado.service.ts'
import type { crearServicioEdicionCaso } from './siniestros-edicion.service.ts'
import type { crearServicioReasignacion } from './siniestros-reasignacion.service.ts'
import { reasignarSiniestroSchema } from '@cova/shared/schemas/reasignacion-siniestro'
import type { crearServicioNovedadesGestion } from '../novedades/novedades-gestion.service.ts'

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
// Vehículos y personas desde la ficha (CU-10 1.c, E5-06), con el mismo control de acceso:
// GET   /api/siniestros/partes/opciones                    catálogos de los formularios
// POST  /api/siniestros/:id/vehiculos                      agrega un vehículo
// PUT   /api/siniestros/:id/vehiculos/:idVehiculo          lo modifica ({ revision, datos }: 409 si cambió)
// PATCH /api/siniestros/:id/vehiculos/:idVehiculo/baja     baja lógica (409 si tiene personas)
// POST  /api/siniestros/:id/personas                       titular, ocupante o persona fuera
// PUT   /api/siniestros/:id/personas/:idPersona            la modifica ({ revision, datos }: 409 si cambió)
// PATCH /api/siniestros/:id/personas/:idPersona/baja       baja lógica
// Abogados y peritos desde la ficha (CU-10 1.d y 1.e, E5-07), con el mismo control de acceso:
// POST  /api/siniestros/:id/abogados                       agrega un abogado y le asigna a quién representa
// PUT   /api/siniestros/:id/abogados/:idAbogado            lo modifica ({ revision, datos }: 409 si cambió)
// PATCH /api/siniestros/:id/abogados/:idAbogado/baja       sus personas de este siniestro quedan sin abogado
// POST  /api/siniestros/:id/peritos                        carga un perito (uno de cada tipo como máximo)
// PUT   /api/siniestros/:id/peritos/:idPerito              lo modifica ({ revision, datos }); el cierre es movimiento
// PATCH /api/siniestros/:id/peritos/:idPerito/baja         baja lógica
// Novedades desde la ficha (CU-10 1.f.1, E5-08), con el mismo control de acceso. No se editan ni se borran:
// POST  /api/siniestros/:id/novedades                      carga una novedad (movimiento del caso; avisa)
// Alta (solo administrador y superadministrador):
// GET  /api/siniestros/alta/opciones
// POST /api/siniestros/alta/datos-caso   valida el paso 1 (204 o el error con su campo)
// POST   /api/siniestros/alta/documentos  sube un documento del alta a R2 (multipart, campo "archivo")
// DELETE /api/siniestros/alta/documentos  { clave } lo quita
// POST   /api/siniestros/alta             crea el siniestro con todo lo cargado y avisa al asignado
export function crearSiniestrosRouter(deps: {
  documentosArchivos: ReturnType<typeof crearServicioArchivosDocumento>
  documentosCarga: ReturnType<typeof crearServicioDocumentosGestion>
  reasignacion: ReturnType<typeof crearServicioReasignacion>
  edicion: ReturnType<typeof crearServicioEdicionCaso>
  estados: ReturnType<typeof crearServicioEstadoSiniestro>
  operaciones: ReturnType<typeof crearServicioBajasSiniestros>
  servicio: ReturnType<typeof crearServicioSiniestros>
  alta: ReturnType<typeof crearServicioAltaSiniestros>
  creacion: ReturnType<typeof crearServicioCrearSiniestro>
  ficha: Record<(typeof PESTANAS_FICHA)[number], PestanaFicha>
  vehiculos: ReturnType<typeof crearServicioVehiculosGestion>
  personas: ReturnType<typeof crearServicioPersonasGestion>
  abogados: ReturnType<typeof crearServicioAbogadosGestion>
  peritos: ReturnType<typeof crearServicioPeritosGestion>
  novedades: ReturnType<typeof crearServicioNovedadesGestion>
  requerirSesion: RequestHandler
}) {
  const {
    servicio,
    alta,
    creacion,
    operaciones,
    estados,
    edicion,
    reasignacion,
    ficha,
    requerirSesion,
  } = deps
  const { vehiculos, personas, abogados, peritos, novedades } = deps
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
  router.get('/partes/opciones', async (_req, res) => {
    res.json(await alta.opcionesPartes())
  })

  router.post(
    '/:id/documentos',
    async (req, _res, next) => {
      idCargaDocumentoSchema.parse(req.header('X-Id-Carga'))
      compresionDocumentoSchema.parse(req.header('X-Archivo-Compresion'))
      await deps.documentosCarga.comprobar(usuarioDeSesion(req), idSchema.parse(req.params.id))
      next()
    },
    recibirArchivo(),
    async (req, res) => {
      if (!req.file) throw new HttpError(400, 'Elegí el archivo que querés cargar.')
      const archivo = await decodificarDocumento(
        { nombreOriginal: nombreOriginalUtf8(req.file.originalname), contenido: req.file.buffer },
        req.header('X-Archivo-Compresion'),
      )
      const resultado = await deps.documentosCarga.subir(
        usuarioDeSesion(req),
        idSchema.parse(req.params.id),
        { idCarga: idCargaDocumentoSchema.parse(req.header('X-Id-Carga')), archivo },
      )
      res.status(resultado.reutilizado ? 200 : 201).json({ id: resultado.id })
    },
  )

  for (const tipo of ['miniatura', 'vista', 'original'] as const) {
    router.get(`/:id/documentos/:idDocumento/${tipo}`, async (req, res) => {
      res.set('Cache-Control', 'private, no-store')
      res.set('Referrer-Policy', 'no-referrer')
      const firma = await deps.documentosArchivos.obtener(
        usuarioDeSesion(req),
        idSchema.parse(req.params.id),
        idSchema.parse(req.params.idDocumento),
        tipo,
      )
      res.redirect(302, firma.url)
    })
  }

  router.get('/:id/edicion', async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await edicion.obtener(usuarioDeSesion(req), idSchema.parse(req.params.id)))
  })
  router.patch('/:id/datos', async (req, res) => {
    res.json(await edicion.modificar(usuarioDeSesion(req), idSchema.parse(req.params.id), req.body))
  })
  router.get('/:id/estados', async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await estados.opciones(usuarioDeSesion(req), idSchema.parse(req.params.id)))
  })
  router.patch('/:id/estado', async (req, res) => {
    await estados.cambiar(
      usuarioDeSesion(req),
      idSchema.parse(req.params.id),
      cambiarEstadoSiniestroSchema.parse(req.body),
    )
    res.status(204).end()
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
  router.get('/:id/reasignacion', soloAdministracion, async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(await reasignacion.opciones(usuarioDeSesion(req), idSchema.parse(req.params.id)))
  })
  router.patch('/:id/reasignacion', soloAdministracion, async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(
      await reasignacion.reasignar(
        usuarioDeSesion(req),
        idSchema.parse(req.params.id),
        reasignarSiniestroSchema.parse(req.body),
      ),
    )
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

  router.post('/:id/vehiculos', async (req, res) => {
    res
      .status(201)
      .json(
        await vehiculos.agregar(
          usuarioDeSesion(req),
          idSchema.parse(req.params.id),
          vehiculoAltaSchema.parse(req.body),
        ),
      )
  })
  router.put('/:id/vehiculos/:idVehiculo', async (req, res) => {
    await vehiculos.modificar(
      usuarioDeSesion(req),
      idSchema.parse(req.params.id),
      idSchema.parse(req.params.idVehiculo),
      modificarVehiculoSchema.parse(req.body),
    )
    res.status(204).end()
  })
  router.patch('/:id/vehiculos/:idVehiculo/baja', async (req, res) => {
    await vehiculos.darDeBaja(
      usuarioDeSesion(req),
      idSchema.parse(req.params.id),
      idSchema.parse(req.params.idVehiculo),
    )
    res.status(204).end()
  })
  router.post('/:id/personas', async (req, res) => {
    res
      .status(201)
      .json(
        await personas.agregar(
          usuarioDeSesion(req),
          idSchema.parse(req.params.id),
          agregarPersonaSchema.parse(req.body),
        ),
      )
  })
  // Los datos se validan en el servicio: el formulario depende de si es titular, ocupante o persona fuera
  router.put('/:id/personas/:idPersona', async (req, res) => {
    await personas.modificar(
      usuarioDeSesion(req),
      idSchema.parse(req.params.id),
      idSchema.parse(req.params.idPersona),
      modificarPersonaSchema.parse(req.body),
    )
    res.status(204).end()
  })
  router.patch('/:id/personas/:idPersona/baja', async (req, res) => {
    await personas.darDeBaja(
      usuarioDeSesion(req),
      idSchema.parse(req.params.id),
      idSchema.parse(req.params.idPersona),
    )
    res.status(204).end()
  })

  router.post('/:id/abogados', async (req, res) => {
    res
      .status(201)
      .json(
        await abogados.agregar(
          usuarioDeSesion(req),
          idSchema.parse(req.params.id),
          abogadoFichaSchema.parse(req.body),
        ),
      )
  })
  router.put('/:id/abogados/:idAbogado', async (req, res) => {
    await abogados.modificar(
      usuarioDeSesion(req),
      idSchema.parse(req.params.id),
      idSchema.parse(req.params.idAbogado),
      modificarAbogadoSchema.parse(req.body),
    )
    res.status(204).end()
  })
  router.patch('/:id/abogados/:idAbogado/baja', async (req, res) => {
    await abogados.darDeBaja(
      usuarioDeSesion(req),
      idSchema.parse(req.params.id),
      idSchema.parse(req.params.idAbogado),
    )
    res.status(204).end()
  })
  router.post('/:id/peritos', async (req, res) => {
    res
      .status(201)
      .json(
        await peritos.agregar(
          usuarioDeSesion(req),
          idSchema.parse(req.params.id),
          peritoAltaSchema.parse(req.body),
        ),
      )
  })
  router.put('/:id/peritos/:idPerito', async (req, res) => {
    await peritos.modificar(
      usuarioDeSesion(req),
      idSchema.parse(req.params.id),
      idSchema.parse(req.params.idPerito),
      modificarPeritoSchema.parse(req.body),
    )
    res.status(204).end()
  })
  router.patch('/:id/peritos/:idPerito/baja', async (req, res) => {
    await peritos.darDeBaja(
      usuarioDeSesion(req),
      idSchema.parse(req.params.id),
      idSchema.parse(req.params.idPerito),
    )
    res.status(204).end()
  })

  router.post('/:id/novedades', async (req, res) => {
    res
      .status(201)
      .json(
        await novedades.cargar(
          usuarioDeSesion(req),
          idSchema.parse(req.params.id),
          novedadSchema.parse(req.body),
        ),
      )
  })

  return router
}
