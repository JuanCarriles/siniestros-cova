import type { SesionUsuario } from '@cova/shared/schemas/auth'
import { bajaDocumentoSchema, permisoBajaDocumento } from '@cova/shared/schemas/documentos'
import { prepararEdicion, type Transaccion } from '../siniestros/partes-edicion.ts'
import { eventoHistorial } from '../historial/historial.textos.ts'
import { HttpError } from '../../utils/httpError.ts'

export function crearServicioBajaDocumento(transaccion: Transaccion, reloj = () => new Date()) {
  return {
    async darDeBaja(
      usuario: SesionUsuario,
      idSiniestro: number,
      idDocumento: number,
      entrada: unknown,
    ) {
      const { motivo } = bajaDocumentoSchema.parse(entrada)
      return transaccion(async (tx) => {
        // Orden compartido: caso, autor y rol vigente. El permiso queda estable hasta el commit.
        const autor = await prepararEdicion(tx, usuario, idSiniestro, { bloquearAutor: true })
        const actor = { id: usuario.id, ...autor }
        const documento = await tx.documentoSiniestro.findFirst({
          where: { id: idDocumento, idSiniestro },
        })
        if (!documento)
          throw new HttpError(404, 'El documento no está disponible en este siniestro.')
        const fecha = reloj()
        // prepararEdicion ya comprobó bajo bloqueo que el caso está activo y no cerrado.
        const permiso = permisoBajaDocumento(
          actor,
          documento,
          { eliminado: false, cerrado: false },
          fecha,
        )
        if (!permiso.permitida)
          throw new HttpError(documento.eliminado ? 409 : 403, permiso.motivo!)
        await tx.documentoSiniestro.update({
          where: { id: documento.id },
          data: { eliminado: true, fechaBaja: fecha, idUsuarioBaja: actor.id, motivoBaja: motivo },
        })
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: actor.id,
            fechaEvento: fecha,
            ...eventoHistorial.documentoDadoDeBaja(actor, documento.nombreOriginal, motivo, fecha),
          },
        })
        // Baja lógica: conservar archivos y derivados en R2, sin reiniciar la demora del caso.
      })
    },
  }
}
