import { getPrisma } from '../../lib/prisma.ts'
import { crearTareaDemoras } from './demoras.service.ts'

// La tarea de casos demorados (E5-10) con la base real. La programa server.ts.
export const tareaDemoras = crearTareaDemoras({
  transaccion: (trabajo) => getPrisma().$transaction(trabajo, { timeout: 30_000 }),
})
