import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { DocumentoFicha } from '@cova/shared/schemas/ficha-siniestro'
import type { Prisma } from '../../generated/prisma/client.ts'
import { nombreDe } from '../siniestros/ficha.ts'
import { exigirAccesoSiniestro } from '../siniestros/siniestros-acceso.ts'

type Base = Pick<Prisma.TransactionClient, 'siniestro' | 'documentoSiniestro'>

// CU-10 1.g (E5-01): los documentos del siniestro con su nombre, tipo, autor y fecha de carga, del más nuevo al
// más viejo. Nunca devuelve la clave de R2: la descarga se pide aparte (1.g.2).
export function crearServicioDocumentosFicha(prisma: Base) {
  return {
    async listar(usuario: SesionUsuario, idSiniestro: number): Promise<DocumentoFicha[]> {
      await exigirAccesoSiniestro(prisma, usuario, idSiniestro)
      const filas = await prisma.documentoSiniestro.findMany({
        where: { idSiniestro, eliminado: false },
        orderBy: [{ fechaCarga: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          nombreOriginal: true,
          tipoExtension: true,
          tamanoBytes: true,
          fechaCarga: true,
          usuario: { select: { nombres: true, apellidos: true, tipoUsuario: true } },
        },
      })
      return filas.map(({ usuario: autor, ...d }) => ({
        ...d,
        tamanoBytes: d.tamanoBytes.toString(),
        fechaCarga: d.fechaCarga.toISOString(),
        autor: { nombre: nombreDe(autor), tipoUsuario: autor.tipoUsuario },
      }))
    },
  }
}
