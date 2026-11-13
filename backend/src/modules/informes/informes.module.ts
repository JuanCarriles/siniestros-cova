import { Router } from 'express'
import { z } from 'zod'
import { generarInformeSchema } from '@cova/shared/schemas/informes'
import { env } from '../../config/env.ts'
import { configCorreo } from '../../config/correo.ts'
import { getPrisma } from '../../lib/prisma.ts'
import { crearAlmacenamientoR2, type AlmacenamientoR2 } from '../../lib/r2.ts'
import { enviarCorreoResend } from '../../lib/correo-resend.ts'
import { requerirRol, usuarioDeSesion } from '../../middlewares/autenticar.ts'
import { requerirSesion } from '../auth/auth.module.ts'
import { crearServicioInformes } from './informes.service.ts'

let r2: AlmacenamientoR2 | undefined
export const servicioInformes = crearServicioInformes({
  db: getPrisma,
  almacenamiento: () => (r2 ??= crearAlmacenamientoR2()),
  pruebasHabilitadas: env.INFORMES_PRUEBA_HABILITADOS,
  enviar: async (email, periodo, pdf, clave) =>
    enviarCorreoResend(configCorreo, {
      email,
      asunto: `Estudio Cova · Informe mensual ${periodo}`,
      claveEnvio: clave,
      html: `<div style="background:#f1f4f7;padding:32px;font-family:Arial,sans-serif;color:#17212d"><div style="max-width:600px;margin:auto;background:white;padding:32px;border-top:4px solid #ef7b22"><p style="color:#203f63;font-weight:bold">ESTUDIO COVA</p><h1>Tu informe mensual está disponible</h1><p>Adjuntamos el informe de gestión correspondiente a ${periodo}.</p><p>Incluye la cartera, cierres, demoras, actividad y resultados del período. También podés descargarlo desde la sección Informes del sistema.</p><p>Este mensaje fue generado automáticamente.</p></div></div>`,
      texto: `Estudio Cova. Se adjunta el informe mensual de ${periodo}. También está disponible en la sección Informes.`,
      adjuntos: [{ filename: `informe-mensual-${periodo}.pdf`, content: pdf.toString('base64') }],
    }),
})
export const informesRouter = Router()
informesRouter.use(
  requerirSesion,
  requerirRol('ADMINISTRADOR', 'SUPER_ADMINISTRADOR'),
  (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store')
    next()
  },
)
informesRouter.get('/', async (req, res) => {
  const pagina = z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.pagina)
  res.json(await servicioInformes.listar(usuarioDeSesion(req), pagina))
})
informesRouter.post('/pruebas', async (req, res) => {
  const p = generarInformeSchema.parse(req.body)
  res
    .status(201)
    .json(await servicioInformes.probar(usuarioDeSesion(req), p.periodo, p.enviarCorreo))
})
informesRouter.get('/:id/descarga', async (req, res) => {
  res.set('Referrer-Policy', 'no-referrer')
  res.json(await servicioInformes.descargar(usuarioDeSesion(req), z.uuid().parse(req.params.id)))
})
informesRouter.post('/:id/correo', async (req, res) => {
  await servicioInformes.reenviar(usuarioDeSesion(req), z.uuid().parse(req.params.id))
  res.status(204).end()
})
informesRouter.post('/:id/reintentar', async (req, res) => {
  res.json(await servicioInformes.reintentar(usuarioDeSesion(req), z.uuid().parse(req.params.id)))
})
