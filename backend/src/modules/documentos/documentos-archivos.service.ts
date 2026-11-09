import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { Prisma } from '../../generated/prisma/client.ts'
import { nombreDescargaArchivo, type AlmacenamientoR2 } from '../../lib/r2.ts'
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
      tipo: 'miniatura' | 'vista' | 'original' | 'contenido',
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
        tipo === 'original' || tipo === 'contenido'
          ? documento.urlArchivoSinDominio
          : tipo === 'miniatura'
            ? documento.claveMiniatura
            : (documento.claveImagenOptimizada ?? documento.urlArchivoSinDominio)
      if (!clave)
        throw new HttpError(404, 'Esta imagen no tiene una vista reducida. Descargá el original.')
      if (!clave.startsWith(`siniestros/${idSiniestro}/`))
        throw new HttpError(409, 'La ubicación del documento no corresponde a este siniestro.')
      if (tipo === 'contenido') {
        if (documento.tipoExtension.toLowerCase() !== 'pdf')
          throw new HttpError(400, 'Esta vista está disponible para archivos PDF.')
        // GET distingue ausencia y entrega el cuerpo como stream; no duplicar la consulta con HEAD.
        return { contenido: await almacenamiento().leerParaVista(clave) }
      }
      // Las miniaturas ya tienen onError en la grilla: no pagar un HEAD por cada tarjeta.
      if (tipo !== 'miniatura') await almacenamiento().comprobarExistencia(clave)
      const principal = clave === documento.urlArchivoSinDominio
      const nombre = nombreDescargaArchivo(
        documento.nombreOriginal,
        principal ? documento.tipoExtension : 'webp',
      )
      return almacenamiento().firmarDescarga(
        clave,
        tipo === 'miniatura' ? nombre.replace(/\.webp$/i, '-miniatura.webp') : nombre,
        principal ? documento.mimeType : 'image/webp',
      )
    },
  }
}
