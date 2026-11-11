import { Router, type RequestHandler } from 'express'
import { consultaChatSchema, enviarMensajeChatSchema } from '@cova/shared/schemas/chat'
import { idSchema } from '@cova/shared/schemas/comunes'
import { requerirRol, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import type { crearServicioChat } from './chat.service.ts'

// CU-10 1.h (E7-02). Se monta en /api/siniestros/:id/chat. El servicio limita al gestor a sus casos.
// GET  /api/siniestros/:id/chat?despues=  conversación (o lo posterior a ese mensaje, al reconectar)
// POST /api/siniestros/:id/chat           { texto, claveEnvio } envía un mensaje; responde el mensaje guardado
// POST /api/siniestros/:id/chat/leidos    E7-03: marca como leído lo pendiente y retira el aviso de la bandeja
// No hay rutas para editar ni borrar mensajes (RF-27).
export function crearChatRouter(deps: {
  requerirSesion: RequestHandler
  chat: ReturnType<typeof crearServicioChat>
}) {
  const router = Router({ mergeParams: true })
  router.use(
    deps.requerirSesion,
    requerirRol('GESTOR', 'ADMINISTRADOR', 'SUPER_ADMINISTRADOR'),
    (_req, res, next) => {
      res.set('Cache-Control', 'no-store')
      next()
    },
  )
  const idDe = (params: unknown) => idSchema.parse((params as { id?: unknown }).id)

  router.get('/', async (req, res) => {
    res.json(
      await deps.chat.listar(
        usuarioDeSesion(req),
        idDe(req.params),
        consultaChatSchema.parse(req.query),
      ),
    )
  })
  router.post('/', async (req, res) => {
    res
      .status(201)
      .json(
        await deps.chat.enviar(
          usuarioDeSesion(req),
          idDe(req.params),
          enviarMensajeChatSchema.parse(req.body),
        ),
      )
  })
  router.post('/leidos', async (req, res) => {
    res.json(await deps.chat.leer(usuarioDeSesion(req), idDe(req.params)))
  })
  return router
}
