import { createHash } from 'node:crypto'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import type { AlmacenamientoR2 } from '../../lib/r2.ts'
import { motivoFalloCorreo } from '../../lib/correo-resend.ts'
import { HttpError } from '../../utils/httpError.ts'

export const ESPERA_INFORME_MS = 15 * 60_000
export function siguienteIntentoInforme(ahora: Date, fallos: number) {
  return new Date(ahora.getTime() + (fallos <= 1 ? 1 : 6) * 3_600_000)
}
export function crearEnvioInforme(
  deps: {
    db: () => PrismaClient
    almacenamiento: () => AlmacenamientoR2
    enviar: (email: string, periodo: string, pdf: Buffer, clave: string) => Promise<void>
  },
  reloj: () => Date,
) {
  return async function enviar(id: string) {
    const db = deps.db(),
      ahora = reloj()
    const preparado = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "InformeMensual" WHERE id = ${id}::uuid FOR UPDATE`
      const informe = await tx.informeMensual.findUniqueOrThrow({ where: { id } })
      if (informe.correoEnviado) return null
      if (informe.estado !== 'LISTO' || !informe.clavePdf)
        throw new HttpError(409, 'El informe todavía no está generado.')
      if (informe.envioHasta && informe.envioHasta > ahora)
        throw new HttpError(409, 'El correo del informe ya se está enviando. Esperá unos minutos.')
      const envioHasta = new Date(ahora.getTime() + ESPERA_INFORME_MS)
      await tx.informeMensual.update({ where: { id }, data: { envioHasta } })
      return { ...informe, envioHasta }
    })
    if (!preparado) return
    const { envioHasta } = preparado
    try {
      const destinatarios = await db.usuario.findMany({
        where: { tipoUsuario: 'SUPER_ADMINISTRADOR', eliminado: false },
        select: { id: true, email: true },
        orderBy: { id: 'asc' },
      })
      if (!destinatarios.length)
        throw new HttpError(409, 'No hay un superadministrador activo para recibir el informe.')
      const enviados = await db.informeMensualEnvio.findMany({
        where: { idInforme: id },
        select: { email: true },
      })
      const pendientes = destinatarios.filter((d) => !enviados.some((e) => e.email === d.email))
      const pdf = pendientes.length
        ? await deps.almacenamiento().leerInforme(preparado.clavePdf!)
        : null
      let fallos = 0
      for (const d of pendientes) {
        // No enviar a un usuario desactivado o con otro correo mientras se leía el PDF.
        const activo = await db.usuario.findFirst({
          where: { id: d.id, email: d.email, tipoUsuario: 'SUPER_ADMINISTRADOR', eliminado: false },
          select: { id: true },
        })
        if (!activo) continue
        const vigente = await db.informeMensual.count({ where: { id, envioHasta } })
        if (!vigente)
          throw new HttpError(409, 'El envío fue retomado por otra ejecución. Actualizá la lista.')
        try {
          // El correo participa en la clave para admitir un cambio de dirección sin reutilizar otra solicitud.
          const huella = createHash('sha256').update(d.email).digest('hex').slice(0, 16)
          await deps.enviar(d.email, preparado.periodo, pdf!, `informe-${id}-${d.id}-${huella}`)
        } catch {
          fallos++
          continue
        }
        // Persistir cada entrega antes de pasar a la siguiente. Resend protege un reintento si se pierde el commit.
        await db.$transaction(async (tx) => {
          const vigente = await tx.informeMensual.updateMany({
            where: { id, envioHasta },
            data: { envioHasta },
          })
          if (!vigente.count) throw new HttpError(409, 'El envío fue retomado por otra ejecución.')
          await tx.informeMensualEnvio.upsert({
            where: { idInforme_email: { idInforme: id, email: d.email } },
            create: { idInforme: id, idUsuario: d.id, email: d.email, enviadoEn: reloj() },
            update: {},
          })
        })
      }
      if (fallos) throw new Error('No se pudieron confirmar todos los destinatarios.')
      const activos = await db.usuario.findMany({
        where: { tipoUsuario: 'SUPER_ADMINISTRADOR', eliminado: false },
        select: { email: true },
      })
      const entregas = await db.informeMensualEnvio.findMany({
        where: { idInforme: id },
        select: { email: true },
      })
      if (!activos.length)
        throw new HttpError(409, 'No hay un superadministrador activo para recibir el informe.')
      if (activos.some((d) => !entregas.some((e) => e.email === d.email)))
        throw new Error('Hay destinatarios activos pendientes.')
      const completado = await db.informeMensual.updateMany({
        where: { id, envioHasta },
        data: {
          correoEnviado: reloj(),
          envioHasta: null,
          proximoIntento: null,
          intentosFallidos: 0,
          error: null,
        },
      })
      if (!completado.count) throw new HttpError(409, 'El envío fue retomado por otra ejecución.')
    } catch (error) {
      const fallos = preparado.intentosFallidos + 1
      const actualizado = await db.informeMensual.updateMany({
        where: { id, envioHasta },
        data: {
          envioHasta: null,
          intentosFallidos: fallos,
          proximoIntento: siguienteIntentoInforme(reloj(), fallos),
          error: `PDF disponible; hay correos pendientes. ${error instanceof HttpError ? error.message : motivoFalloCorreo(error)}`,
        },
      })
      if (!actualizado.count) throw new HttpError(409, 'El envío fue retomado por otra ejecución.')
      if (error instanceof HttpError && error.status === 409) throw error
      throw new HttpError(
        502,
        'El PDF quedó guardado, pero hay correos pendientes. Podés reintentar el envío.',
      )
    }
  }
}
