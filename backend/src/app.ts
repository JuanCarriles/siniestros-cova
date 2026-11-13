import cookieParser from 'cookie-parser'
import express, { Router } from 'express'
import helmet from 'helmet'
import { errorHandler, notFound } from './middlewares/errorHandler.ts'
import { ajustadoresRouter } from './modules/ajustadores/ajustadores.module.ts'
import { aseguradorasRouter } from './modules/aseguradoras/aseguradoras.module.ts'
import { authRouter } from './modules/auth/auth.module.ts'
import { usuariosRouter } from './modules/usuarios/usuarios.module.ts'
import { perfilRouter } from './modules/perfil/perfil.module.ts'
import { plantillasRouter } from './modules/plantillas/plantillas.module.ts'
import { healthRouter } from './modules/health/health.routes.ts'
import { dashboardRouter } from './modules/dashboard/dashboard.module.ts'
import { siniestrosRouter } from './modules/siniestros/siniestros.module.ts'
import { chatRouter } from './modules/chat/chat.module.ts'
import { notificacionesRouter } from './modules/notificaciones/notificaciones.module.ts'
import { informesRouter } from './modules/informes/informes.module.ts'

export const app = express()

// Corre detrás de Nginx: necesario para que req.ip y las cookies "secure" funcionen.
app.set('trust proxy', 1)
app.disable('x-powered-by')

app.use(helmet())
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

const api = Router()

api.use('/health', healthRouter)
api.use('/auth', authRouter)
api.use('/aseguradoras', aseguradorasRouter)
api.use('/ajustadores', ajustadoresRouter)
api.use('/usuarios', usuariosRouter)
api.use('/perfil', perfilRouter)
// E7-02: antes que el router de siniestros, que también atiende /:id/...
api.use('/siniestros/:id/chat', chatRouter)
api.use('/siniestros', siniestrosRouter)
api.use('/dashboard', dashboardRouter)
api.use('/notificaciones', notificacionesRouter)
api.use('/plantillas', plantillasRouter)
api.use('/informes', informesRouter)

// Los routers de cada módulo se montan acá. Las rutas protegidas usan requerirSesion y requerirRol
// (ver modules/auth/auth.module.ts).

app.use('/api', api)

app.use(notFound)
app.use(errorHandler)
