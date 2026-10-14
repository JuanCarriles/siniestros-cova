import { documentoPlantillaSchema } from '@cova/shared/schemas/plantillas'
import { documentoSiniestroSchema } from '@cova/shared/schemas/documentos'
import { idSchema } from '@cova/shared/schemas/comunes'
import type { Prisma } from '../../generated/prisma/client.ts'
import type { AlmacenamientoR2, ArchivoEntrada } from '../../lib/r2.ts'
import { HttpError } from '../../utils/httpError.ts'

type BaseDocumentos = Pick<Prisma.TransactionClient, 'usuario' | 'siniestro' | 'documentoSiniestro' | 'documentoPlantilla'>
type Destino = { tipo: 'siniestro'; idSiniestro: number } | { tipo: 'plantilla' }
type Acceso = { idUsuario: number; accion: 'subir' | 'descargar'; destino: Destino; idDocumento?: number }

// Servicio interno. El futuro controlador obtiene idUsuario de la sesión y provee
// una política real de permisos. Sin esa política no se puede construir el servicio.
export function crearServicioDocumentos(deps: {
  prisma: BaseDocumentos
  almacenamiento: AlmacenamientoR2
  autorizar: (acceso: Acceso) => Promise<void>
}) {
  const { prisma, almacenamiento, autorizar } = deps

  async function comprobarAcceso(acceso: Acceso) {
    const usuario = await prisma.usuario.findFirst({ where: { id: acceso.idUsuario, eliminado: false }, select: { id: true } })
    if (!usuario) throw new HttpError(403, 'Usuario no disponible')
    await autorizar(acceso)
    if (acceso.destino.tipo === 'siniestro') {
      const siniestro = await prisma.siniestro.findFirst({
        where: { id: acceso.destino.idSiniestro, eliminado: false }, select: { id: true },
      })
      if (!siniestro) throw new HttpError(404, 'Siniestro no disponible')
    }
  }

  return {
    async subir(entrada: { idUsuario: number; destino: Destino; archivo: ArchivoEntrada }) {
      const idUsuario = idSchema.parse(entrada.idUsuario)
      const destino: Destino = entrada.destino.tipo === 'siniestro'
        ? { tipo: 'siniestro', idSiniestro: idSchema.parse(entrada.destino.idSiniestro) }
        : { tipo: 'plantilla' }
      await comprobarAcceso({ idUsuario, accion: 'subir', destino })
      const carpeta = destino.tipo === 'siniestro' ? `siniestros/${destino.idSiniestro}` : 'plantillas'
      const archivo = await almacenamiento.subir(entrada.archivo, carpeta)
      try {
        if (destino.tipo === 'siniestro') {
          const data = documentoSiniestroSchema.parse({
            nombreOriginal: archivo.nombreOriginal, urlArchivoSinDominio: archivo.clave,
            tipoExtension: archivo.tipoExtension, mimeType: archivo.mimeType,
            tamanoBytes: archivo.tamanoBytes, idUsuario, idSiniestro: destino.idSiniestro,
          })
          const documento = await prisma.documentoSiniestro.create({ data: { ...data, tamanoBytes: BigInt(data.tamanoBytes) } })
          return { ...documento, tamanoBytes: documento.tamanoBytes.toString() }
        }
        const data = documentoPlantillaSchema.parse({
          nombreOriginal: archivo.nombreOriginal, urlArchivo: archivo.clave,
          tipoExtension: archivo.tipoExtension, idUsuario,
        })
        return await prisma.documentoPlantilla.create({ data })
      } catch {
        try {
          await almacenamiento.eliminar(archivo.clave)
        } catch {
          // Sólo la clave generada: permite localizar el huérfano sin exponer secretos ni URLs.
          console.error('Objeto pendiente de limpieza en R2:', archivo.clave)
        }
        throw new HttpError(503, 'No se pudo registrar el documento en la base de datos')
      }
    },

    async descargar(entrada: { idUsuario: number; tipo: Destino['tipo']; idDocumento: number }) {
      const idUsuario = idSchema.parse(entrada.idUsuario)
      const idDocumento = idSchema.parse(entrada.idDocumento)
      if (entrada.tipo === 'siniestro') {
        const documento = await prisma.documentoSiniestro.findFirst({ where: { id: idDocumento, eliminado: false } })
        if (!documento) throw new HttpError(404, 'Documento no disponible')
        await comprobarAcceso({ idUsuario, accion: 'descargar', idDocumento,
          destino: { tipo: 'siniestro', idSiniestro: documento.idSiniestro } })
        return almacenamiento.firmarDescarga(documento.urlArchivoSinDominio, documento.nombreOriginal)
      }
      const documento = await prisma.documentoPlantilla.findFirst({ where: { id: idDocumento, eliminado: false } })
      if (!documento) throw new HttpError(404, 'Plantilla no disponible')
      await comprobarAcceso({ idUsuario, accion: 'descargar', idDocumento, destino: { tipo: 'plantilla' } })
      return almacenamiento.firmarDescarga(documento.urlArchivo, documento.nombreOriginal)
    },
  }
}
