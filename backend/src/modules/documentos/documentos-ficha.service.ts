import { permisoBajaDocumento } from '@cova/shared/schemas/documentos'
import { HttpError } from '../../utils/httpError.ts'
import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { DocumentoFicha } from '@cova/shared/schemas/ficha-siniestro'
import type { Prisma } from '../../generated/prisma/client.ts'
import { nombreDe } from '../siniestros/ficha.ts'
import { exigirAccesoSiniestro } from '../siniestros/siniestros-acceso.ts'

type Base = Pick<Prisma.TransactionClient, 'siniestro' | 'documentoSiniestro' | 'usuario'>

// CU-10 1.g (E5-01): los documentos del siniestro con su nombre, tipo, autor y fecha de carga, del más nuevo al
// más viejo. Nunca devuelve la clave de R2: la descarga se pide aparte (1.g.2).
export function crearServicioDocumentosFicha(prisma: Base, reloj = () => new Date()) {
  return {
    async listar(usuario: SesionUsuario, idSiniestro: number): Promise<DocumentoFicha[]> {
      const actor = await prisma.usuario.findFirst({
        where: { id: usuario.id, eliminado: false },
        select: { id: true, tipoUsuario: true },
      })
      if (!actor) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
      await exigirAccesoSiniestro(prisma, { ...usuario, ...actor }, idSiniestro)
      const caso = await prisma.siniestro.findUniqueOrThrow({
        where: { id: idSiniestro },
        select: { eliminado: true, estadoSiniestro: { select: { esCierre: true } } },
      })
      const ahora = reloj()
      const filas = await prisma.documentoSiniestro.findMany({
        where: { idSiniestro, eliminado: false },
        orderBy: [{ fechaCarga: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          idUsuario: true,
          eliminado: true,
          nombreOriginal: true,
          tipoExtension: true,
          tamanoBytes: true,
          fechaCarga: true,
          claveMiniatura: true,
          claveImagenOptimizada: true,
          anchoOriginal: true,
          altoOriginal: true,
          anchoImagen: true,
          altoImagen: true,
          tamanoOptimizadoBytes: true,
          usuario: { select: { nombres: true, apellidos: true, tipoUsuario: true } },
        },
      })
      return filas.map(
        ({
          usuario: autor,
          idUsuario,
          eliminado,
          claveMiniatura,
          claveImagenOptimizada,
          anchoOriginal,
          altoOriginal,
          anchoImagen,
          altoImagen,
          tamanoOptimizadoBytes,
          ...d
        }) => ({
          baja: permisoBajaDocumento(
            actor,
            { idUsuario, eliminado, fechaCarga: d.fechaCarga },
            { eliminado: caso.eliminado, cerrado: caso.estadoSiniestro.esCierre },
            ahora,
          ),
          imagen:
            claveMiniatura &&
            claveImagenOptimizada &&
            anchoOriginal &&
            altoOriginal &&
            anchoImagen &&
            altoImagen &&
            tamanoOptimizadoBytes
              ? {
                  anchoOriginal,
                  altoOriginal,
                  ancho: anchoImagen,
                  alto: altoImagen,
                  tamanoBytes: tamanoOptimizadoBytes.toString(),
                }
              : null,
          ...d,
          tamanoBytes: d.tamanoBytes.toString(),
          fechaCarga: d.fechaCarga.toISOString(),
          autor: { nombre: nombreDe(autor), tipoUsuario: autor.tipoUsuario },
        }),
      )
    },
  }
}
