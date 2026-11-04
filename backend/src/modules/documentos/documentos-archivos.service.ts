import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { Prisma } from '../../generated/prisma/client.ts'
import type { AlmacenamientoR2 } from '../../lib/r2.ts'
import { exigirAccesoSiniestro } from '../siniestros/siniestros-acceso.ts'
import { HttpError } from '../../utils/httpError.ts'

export function crearServicioArchivosDocumento(
  prisma: Pick<Prisma.TransactionClient, 'usuario' | 'siniestro' | 'documentoSiniestro'>,
  almacenamiento: () => AlmacenamientoR2,
) {
  return {
    async obtener(
      usuario: SesionUsuario,
      idSiniestro: number,
      idDocumento: number,
      tipo: 'miniatura' | 'vista' | 'original',
    ) {
      const actor = await prisma.usuario.findFirst({
        where: { id: usuario.id, eliminado: false },
        select: { id: true, tipoUsuario: true },
      })
      if (!actor) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
      await exigirAccesoSiniestro(
        prisma,
        { ...usuario, tipoUsuario: actor.tipoUsuario },
        idSiniestro,
      )
      const documento = await prisma.documentoSiniestro.findFirst({
        where: { id: idDocumento, idSiniestro, eliminado: false },
      })
      if (!documento) throw new HttpError(404, 'El documento no está disponible.')
      const clave =
        tipo === 'original'
          ? documento.urlArchivoSinDominio
          : tipo === 'miniatura'
            ? documento.claveMiniatura
            : documento.claveImagenOptimizada
      if (!clave)
        throw new HttpError(404, 'Esta imagen no tiene una vista reducida. Descargá el original.')
      if (!clave.startsWith(`siniestros/${idSiniestro}/`))
        throw new HttpError(409, 'La ubicación del documento no corresponde a este siniestro.')
      await almacenamiento().comprobarExistencia(clave)
      return almacenamiento().firmarDescarga(
        clave,
        tipo === 'original' ? documento.nombreOriginal : `${tipo}.webp`,
        tipo !== 'original',
      )
    },
  }
}
