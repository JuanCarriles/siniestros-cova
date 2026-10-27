import {
  confirmarSiniestroSchema,
  esCierreEnviado,
  type ConfirmarSiniestro,
} from '@cova/shared/schemas/siniestros'
import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { Prisma } from '../../generated/prisma/client.ts'
import type { AlmacenamientoR2 } from '../../lib/r2.ts'
import { eventoHistorial } from '../historial/historial.textos.ts'
import { HttpError } from '../../utils/httpError.ts'

export type BaseBajasSiniestros = {
  transaccion<T>(trabajo: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>
}
export function crearServicioBajasSiniestros(deps: {
  base: BaseBajasSiniestros
  almacenamiento: () => Pick<AlmacenamientoR2, 'eliminar'>
  reloj?: () => Date
}) {
  const { base, almacenamiento, reloj = () => new Date() } = deps
  async function autorizar(tx: Prisma.TransactionClient, idUsuario: number) {
    const actor = await tx.usuario.findFirst({
      where: { id: idUsuario, eliminado: false },
      select: { id: true, nombres: true, apellidos: true, tipoUsuario: true },
    })
    if (!actor) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
    if (actor.tipoUsuario !== 'ADMINISTRADOR' && actor.tipoUsuario !== 'SUPER_ADMINISTRADOR') {
      throw new HttpError(
        403,
        'Solo un administrador o superadministrador puede dar de baja, reactivar o eliminar siniestros.',
      )
    }
    return actor
  }
  async function buscar(tx: Prisma.TransactionClient, id: number) {
    // Orden fijo: el bloqueo del padre serializa la baja y las fases del borrado físico.
    await tx.$queryRaw`SELECT "id" FROM "Siniestro" WHERE "id" = ${id} FOR UPDATE`
    return tx.siniestro.findUnique({
      where: { id },
      select: {
        id: true,
        numeroSiniestro: true,
        eliminado: true,
        eliminacionEnCurso: true,
        idDireccion: true,
        idUsuario: true,
        idAjustador: true,
        estadoSiniestro: { select: { nombre: true, esCierre: true } },
      },
    })
  }
  function confirmar(numeroActual: string, confirmacion: ConfirmarSiniestro) {
    if (numeroActual !== confirmacion.numeroSiniestro) {
      throw new HttpError(
        400,
        'El número ingresado no coincide con el del siniestro. Escribilo exactamente como aparece.',
        { campo: 'numeroSiniestro' },
      )
    }
  }
  function exigirBaja(fila: { eliminado: boolean }) {
    if (!fila.eliminado)
      throw new HttpError(
        409,
        'Primero tenés que dar de baja el siniestro para eliminarlo definitivamente. Actualizá el listado.',
        { codigo: 'SINIESTRO_NO_DADO_DE_BAJA' },
      )
  }
  function exigirCierre(estado: { esCierre: boolean }) {
    if (!esCierreEnviado(estado)) {
      throw new HttpError(
        409,
        'Solo se puede eliminar definitivamente un siniestro en estado de cierre. Actualizá el listado.',
        { codigo: 'SINIESTRO_NO_CERRADO' },
      )
    }
  }
  async function clavesDocumentos(tx: Prisma.TransactionClient, id: number) {
    // Incluye los documentos dados de baja: también conservan su archivo en R2.
    const documentos = await tx.documentoSiniestro.findMany({
      where: { idSiniestro: id },
      select: { urlArchivoSinDominio: true },
    })
    const claves = [...new Set(documentos.map((d) => d.urlArchivoSinDominio))]
    if (claves.some((clave) => !clave.startsWith(`siniestros/${id}/`))) {
      throw new HttpError(
        409,
        'Hay un archivo cuya ubicación no corresponde a este siniestro. Revisá sus documentos antes de eliminarlo.',
      )
    }
    if (
      claves.length &&
      (await tx.documentoSiniestro.count({
        where: {
          idSiniestro: { not: id },
          urlArchivoSinDominio: { in: claves },
        },
      }))
    ) {
      throw new HttpError(
        409,
        'Hay archivos compartidos con otro siniestro. Revisá sus documentos antes de eliminarlo.',
      )
    }
    return claves
  }
  async function borrarArchivos(claves: string[]) {
    if (!claves.length) return
    const r2 = almacenamiento()
    for (let i = 0; i < claves.length; i += 5) {
      const resultados = await Promise.allSettled(
        claves.slice(i, i + 5).map((clave) => r2.eliminar(clave)),
      )
      if (resultados.some((r) => r.status === 'rejected')) {
        throw new HttpError(
          503,
          'No se pudieron eliminar todos los archivos. El siniestro conserva sus registros y la eliminación se puede reintentar.',
          { codigo: 'ELIMINACION_SINIESTRO_PENDIENTE' },
        )
      }
    }
  }
  // Si se agrega una tabla con idSiniestro, sumarla acá y a la prueba del expediente completo.
  async function borrarRegistros(
    tx: Prisma.TransactionClient,
    id: number,
    idDireccion: number | null,
  ) {
    const personas = await tx.personaInvolucrada.findMany({
      where: { idSiniestro: id },
      select: { idVehiculo: true, idDireccion: true },
    })
    const peritos = await tx.perito.findMany({
      where: { idSiniestro: id },
      select: { idDireccion: true },
    })
    const vehiculos = [
      ...new Set(personas.flatMap((p) => (p.idVehiculo === null ? [] : [p.idVehiculo]))),
    ]
    const direcciones = [
      ...new Set(
        [
          idDireccion,
          ...personas.map((p) => p.idDireccion),
          ...peritos.map((p) => p.idDireccion),
        ].filter((id): id is number => id !== null),
      ),
    ]
    await tx.lecturaMensajeChat.deleteMany({ where: { mensajeChat: { idSiniestro: id } } })
    await tx.mensajeChat.deleteMany({ where: { idSiniestro: id } })
    await tx.notificacion.deleteMany({ where: { idSiniestro: id } })
    await tx.historialSiniestro.deleteMany({ where: { idSiniestro: id } })
    await tx.novedadSiniestro.deleteMany({ where: { idSiniestro: id } })
    await tx.documentoSiniestro.deleteMany({ where: { idSiniestro: id } })
    await tx.personaInvolucrada.deleteMany({ where: { idSiniestro: id } })
    await tx.perito.deleteMany({ where: { idSiniestro: id } })
    if (vehiculos.length)
      await tx.vehiculo.deleteMany({
        where: { id: { in: vehiculos }, personasInvolucradas: { none: {} } },
      })
    await tx.siniestro.delete({ where: { id } })
    // Direcciones o vehículos compartidos y catálogos maestros se conservan.
    if (direcciones.length)
      await tx.direccion.deleteMany({
        where: {
          id: { in: direcciones },
          usuarios: { none: {} },
          siniestros: { none: {} },
          perito: { is: null },
          personaInvolucrada: { is: null },
        },
      })
  }
  return {
    async darDeBaja(usuario: SesionUsuario, id: number) {
      await base.transaccion(async (tx) => {
        const actor = await autorizar(tx, usuario.id)
        const fila = await buscar(tx, id)
        if (!fila) throw new HttpError(404, 'El siniestro no existe.')
        // Un borrado pendiente anterior a esta regla puede recibir la baja para completar su eliminación.
        if (fila.eliminacionEnCurso && fila.eliminado)
          throw new HttpError(
            409,
            'Este siniestro tiene una eliminación definitiva pendiente. Reintentá la eliminación desde el listado.',
          )
        if (fila.eliminado) return
        const ahora = reloj()
        await tx.siniestro.update({
          where: { id },
          data: { eliminado: true, fechaBaja: ahora, fechaUltimoMovimiento: ahora },
        })
        await tx.historialSiniestro.create({
          data: {
            idSiniestro: id,
            idUsuario: actor.id,
            fechaEvento: ahora,
            ...eventoHistorial.bajaSiniestro(actor, ahora),
          },
        })
      })
    },
    async reactivar(usuario: SesionUsuario, id: number) {
      await base.transaccion(async (tx) => {
        const actor = await autorizar(tx, usuario.id)
        const fila = await buscar(tx, id)
        if (!fila) throw new HttpError(404, 'El siniestro no existe.')
        if (fila.eliminacionEnCurso)
          throw new HttpError(
            409,
            'No se puede reactivar: la eliminación definitiva ya comenzó y puede haber archivos borrados. Reintentá la eliminación para completarla.',
          )
        if (!fila.eliminado) return
        // No reintroducir un caso activo en un usuario o ajustador que ya fue dado de baja.
        if (!fila.estadoSiniestro.esCierre) {
          await tx.$queryRaw`SELECT "id" FROM "Usuario" WHERE "id" = ${fila.idUsuario} FOR UPDATE`
          const asignado = await tx.usuario.findUnique({
            where: { id: fila.idUsuario },
            select: { eliminado: true },
          })
          if (!asignado || asignado.eliminado)
            throw new HttpError(
              409,
              'Primero reactivá al usuario asignado antes de reactivar este siniestro.',
            )
          if (fila.idAjustador !== null) {
            await tx.$queryRaw`SELECT "id" FROM "Ajustador" WHERE "id" = ${fila.idAjustador} FOR UPDATE`
            const ajustador = await tx.ajustador.findUnique({
              where: { id: fila.idAjustador },
              select: { eliminado: true },
            })
            if (!ajustador || ajustador.eliminado)
              throw new HttpError(
                409,
                'Primero reactivá al ajustador asignado antes de reactivar este siniestro.',
              )
          }
        }
        const ahora = reloj()
        await tx.siniestro.update({
          where: { id },
          data: { eliminado: false, fechaBaja: null, fechaUltimoMovimiento: ahora },
        })
        await tx.historialSiniestro.create({
          data: {
            idSiniestro: id,
            idUsuario: actor.id,
            fechaEvento: ahora,
            ...eventoHistorial.reactivacionSiniestro(actor, ahora),
          },
        })
      })
    },
    async eliminar(usuario: SesionUsuario, id: number, entrada: ConfirmarSiniestro) {
      const confirmacion = confirmarSiniestroSchema.parse(entrada)
      const inicial = await base.transaccion(async (tx) => {
        await autorizar(tx, usuario.id)
        const fila = await buscar(tx, id)
        if (!fila) return null
        confirmar(fila.numeroSiniestro, confirmacion)
        exigirCierre(fila.estadoSiniestro)
        exigirBaja(fila)
        const claves = await clavesDocumentos(tx, id)
        await tx.siniestro.update({ where: { id }, data: { eliminacionEnCurso: true } })
        return claves
      })
      if (inicial === null) return
      // Una sola pasada de R2 fuera de las transacciones; los fallos se reintentan desde el listado.
      await borrarArchivos(inicial)
      await base.transaccion(async (tx) => {
        await autorizar(tx, usuario.id)
        const fila = await buscar(tx, id)
        if (!fila) return
        confirmar(fila.numeroSiniestro, confirmacion)
        exigirCierre(fila.estadoSiniestro)
        exigirBaja(fila)
        if (!fila.eliminacionEnCurso)
          throw new HttpError(409, 'El siniestro cambió. Actualizá el listado antes de reintentar.')
        // Una carga pudo pasar su última comprobación justo antes de marcar el caso.
        // El bloqueo del padre protege esta comprobación y el borrado de las filas hijas.
        const actuales = await clavesDocumentos(tx, id)
        if (actuales.some((clave) => !inicial.includes(clave)))
          throw new HttpError(
            409,
            'El inventario de archivos cambió. El siniestro conserva sus registros. Reintentá para completar la eliminación.',
            { codigo: 'ELIMINACION_SINIESTRO_PENDIENTE' },
          )
        await borrarRegistros(tx, id, fila.idDireccion)
      })
    },
  }
}
