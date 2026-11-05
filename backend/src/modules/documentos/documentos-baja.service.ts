import type { SesionUsuario } from '@cova/shared/schemas/auth'
import { bajaDocumentoSchema, permisoBajaDocumento } from '@cova/shared/schemas/documentos'
import type { Transaccion } from '../siniestros/partes-edicion.ts'
import { exigirAccesoSiniestro } from '../siniestros/siniestros-acceso.ts'
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
        // Igual orden que la carga y la reasignación. Revalidar DESPUÉS del bloqueo impide
        // que un gestor conserve permisos si otra operación acaba de reasignar el expediente.
        await tx.$queryRaw`SELECT "id" FROM "Siniestro" WHERE "id" = ${idSiniestro} FOR UPDATE`
        await tx.$queryRaw`SELECT "id" FROM "Usuario" WHERE "id" = ${usuario.id} FOR SHARE`
        const actor = await tx.usuario.findFirst({
          where: { id: usuario.id, eliminado: false },
          select: { id: true, nombres: true, apellidos: true, tipoUsuario: true },
        })
        if (!actor) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
        await exigirAccesoSiniestro(tx, { ...usuario, ...actor }, idSiniestro)
        const caso = await tx.siniestro.findUniqueOrThrow({
          where: { id: idSiniestro },
          select: { eliminado: true, estadoSiniestro: { select: { esCierre: true } } },
        })
        const documento = await tx.documentoSiniestro.findFirst({
          where: { id: idDocumento, idSiniestro },
        })
        if (!documento)
          throw new HttpError(404, 'El documento no está disponible en este siniestro.')
        const fecha = reloj()
        const permiso = permisoBajaDocumento(
          actor,
          documento,
          { eliminado: caso.eliminado, cerrado: caso.estadoSiniestro.esCierre },
          fecha,
        )
        if (!permiso.permitida)
          throw new HttpError(
            documento.eliminado || caso.eliminado || caso.estadoSiniestro.esCierre ? 409 : 403,
            permiso.motivo!,
          )
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
        // Baja lógica: conservar original y derivados en R2, sin reiniciar la demora del caso.
      })
    },
  }
}
