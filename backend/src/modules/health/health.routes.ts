import { Router } from 'express'
import { getPrisma } from '../../lib/prisma.ts'

// GET /api/health — lo usa el healthcheck de Docker y sirve para verificar un deploy.
// Responde 200 si la API funciona Y llega a la base; 503 si la base no responde.
export const healthRouter = Router()

healthRouter.get('/', async (_req, res) => {
  const time = new Date().toISOString()
  try {
    await getPrisma().$queryRaw`SELECT 1`
    res.json({ status: 'ok', db: 'ok', time })
  } catch (err) {
    console.error('Healthcheck: la base de datos no responde.', err)
    res.status(503).json({ status: 'error', db: 'sin conexión', time })
  }
})
