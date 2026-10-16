import cookieParser from 'cookie-parser'
import express, { Router } from 'express'
import helmet from 'helmet'
import { errorHandler, notFound } from './middlewares/errorHandler.ts'
import { healthRouter } from './modules/health/health.routes.ts'
import {
  aseguradorasRouter,
  autorizarVistaPrevia,
} from './modules/aseguradoras/aseguradoras.routes.ts'
import { env } from './config/env.ts'

export const app = express()

// Corre detrás de Nginx: necesario para que req.ip y las cookies "secure" funcionen.
app.set('trust proxy', 1)
app.disable('x-powered-by')

app.use(helmet())
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

const api = Router()

api.use('/health', healthRouter)
api.use('/aseguradoras', aseguradorasRouter)
if (env.NODE_ENV === 'development') {
  api.use('/vista-previa/aseguradoras', autorizarVistaPrevia, aseguradorasRouter)
}

// Los routers de cada módulo se montan acá, por ejemplo:

app.use('/api', api)

app.use(notFound)
app.use(errorHandler)
