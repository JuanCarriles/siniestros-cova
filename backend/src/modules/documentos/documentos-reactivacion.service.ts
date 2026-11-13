import type { SesionUsuario } from '@cova/shared/schemas/auth'
import { permisoReactivarDocumento } from '@cova/shared/schemas/documentos'
import type { AlmacenamientoR2 } from '../../lib/r2.ts'
import { perteneceClaveSiniestroR2 } from '../../lib/rutas-r2.ts'
import { HttpError } from '../../utils/httpError.ts'
import { prepararEdicion, type Transaccion, type Tx } from '../siniestros/partes-edicion.ts'
import { eventoHistorial } from '../historial/historial.textos.ts'

export function crearServicioReactivacionDocumento(
  deps: {
    transaccion: Transaccion
    almacenamiento: () => Pick<AlmacenamientoR2, 'comprobarExistencia' | 'entorno'>
  },
  reloj = () => new Date(),
) {
  async function comprobar(
    tx: Tx,
    usuario: SesionUsuario,
    idSiniestro: number,
    idDocumento: number,
  ) {
    const autor = await prepararEdicion(tx, usuario, idSiniestro, { bloquearAutor: true })
    if (autor.tipoUsuario !== 'ADMINISTRADOR' && autor.tipoUsuario !== 'SUPER_ADMINISTRADOR')
      throw new HttpError(
        403,
        'Solo un administrador o superadministrador puede reactivar documentos.',
      )
    const documento = await tx.documentoSiniestro.findFirst({
      where: { id: idDocumento, idSiniestro },
    })
    if (!documento) throw new HttpError(404, 'El documento no está disponible en este siniestro.')
    const permiso = permisoReactivarDocumento(autor, documento, {
      eliminado: false,
      cerrado: false,
    })
    if (!permiso.permitida) throw new HttpError(409, permiso.motivo!)
    const caso = await tx.siniestro.findUniqueOrThrow({
      where: { id: idSiniestro },
      select: { id: true, carpetaR2: true },
    })
    if (
      !perteneceClaveSiniestroR2(
        documento.urlArchivoSinDominio,
        caso,
        deps.almacenamiento().entorno,
      )
    )
      throw new HttpError(409, 'La ubicación del documento no corresponde a este siniestro.')
    return { autor, documento }
  }
  return {
    async reactivar(usuario: SesionUsuario, idSiniestro: number, idDocumento: number) {
      const inicial = await deps.transaccion((tx) =>
        comprobar(tx, usuario, idSiniestro, idDocumento),
      )
      // R2 fuera de la transacción: no retener bloqueos durante la solicitud remota.
      try {
        await deps.almacenamiento().comprobarExistencia(inicial.documento.urlArchivoSinDominio)
      } catch (error) {
        if (error instanceof HttpError && error.status === 404)
          throw new HttpError(
            409,
            'No se puede reactivar: el archivo ya no existe en el almacenamiento. Volvé a cargarlo.',
          )
        throw new HttpError(
          503,
          'No se pudo comprobar el archivo en el almacenamiento. Reintentá más tarde.',
        )
      }
      await deps.transaccion(async (tx) => {
        const { autor, documento } = await comprobar(tx, usuario, idSiniestro, idDocumento)
        if (documento.urlArchivoSinDominio !== inicial.documento.urlArchivoSinDominio)
          throw new HttpError(
            409,
            'El documento cambió mientras se verificaba. Actualizá y reintentá.',
          )
        await tx.documentoSiniestro.update({
          where: { id: idDocumento },
          data: { eliminado: false, fechaBaja: null, motivoBaja: null, idUsuarioBaja: null },
        })
        const fecha = reloj()
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            fechaEvento: fecha,
            ...eventoHistorial.documentoReactivado(autor, documento.nombreOriginal, fecha),
          },
        })
        // Conserva fecha/autor de carga y todas las claves de R2. No es una carga nueva ni reinicia la demora.
      })
    },
  }
}
