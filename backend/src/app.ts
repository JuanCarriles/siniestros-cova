import cookieParser from 'cookie-parser'
import express, { Router } from 'express'
import helmet from 'helmet'
import { errorHandler, notFound } from './middlewares/errorHandler.ts'
import { ajustadoresRouter } from './modules/ajustadores/ajustadores.module.ts'
import { aseguradorasRouter } from './modules/aseguradoras/aseguradoras.module.ts'
import { authRouter } from './modules/auth/auth.module.ts'
import { usuariosRouter } from './modules/usuarios/usuarios.module.ts'
import { healthRouter } from './modules/health/health.routes.ts'

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

// Los routers de cada módulo se montan acá. Las rutas protegidas usan requerirSesion y requerirRol
// (ver modules/auth/auth.module.ts).

app.use('/api', api)

app.use(notFound)
app.use(errorHandler)
