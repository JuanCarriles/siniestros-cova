import { createHash } from 'node:crypto'
import type { SesionUsuario } from '@cova/shared/schemas/auth'
import { idCargaDocumentoSchema } from '@cova/shared/schemas/documentos'
import { TipoNotificacion, type Prisma } from '../../generated/prisma/client.ts'
import { nombreCompleto } from '../../utils/formato.ts'
import { prepararEdicion, registrarMovimiento } from '../siniestros/partes-edicion.ts'
import type { AlmacenamientoR2, ArchivoEntrada } from '../../lib/r2.ts'
import { HttpError } from '../../utils/httpError.ts'
import { exigirAccesoSiniestro } from '../siniestros/siniestros-acceso.ts'
import { eventoHistorial } from '../historial/historial.textos.ts'
import { datosImagenEnBase, subirDocumentoProcesado } from './imagenes-documento.ts'
import { validarArchivoPlantilla } from '../plantillas/validar-archivo.ts'

type Tx = Prisma.TransactionClient
export function crearServicioDocumentosGestion(
  deps: {
    transaccion: <T>(trabajo: (tx: Tx) => Promise<T>) => Promise<T>
    almacenamiento: () => AlmacenamientoR2
  },
  reloj = () => new Date(),
) {
  async function comprobar(tx: Tx, usuario: SesionUsuario, id: number) {
    const actor = await tx.usuario.findFirst({
      where: { id: usuario.id, eliminado: false },
      select: { id: true, nombres: true, apellidos: true, email: true, tipoUsuario: true },
    })
    if (!actor) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
    await exigirAccesoSiniestro(tx, actor, id)
    const caso = await tx.siniestro.findUniqueOrThrow({
      where: { id },
      select: { eliminado: true, estadoSiniestro: { select: { esCierre: true } } },
    })
    if (caso.eliminado || caso.estadoSiniestro.esCierre)
      throw new HttpError(
        409,
        'No se pueden cargar documentos en un siniestro cerrado o dado de baja.',
      )
    return actor
  }
  return {
    comprobar(usuario: SesionUsuario, id: number) {
      return deps.transaccion((tx) => comprobar(tx, usuario, id))
    },
    async subir(
      usuario: SesionUsuario,
      id: number,
      entrada: { idCarga: string; archivo: ArchivoEntrada },
    ) {
      const idCarga = idCargaDocumentoSchema.parse(entrada.idCarga)
      const archivo = entrada.archivo
      await validarArchivoPlantilla(archivo)
      const hashContenido = createHash('sha256').update(archivo.contenido).digest('hex')
      async function existente(tx: Tx) {
        const previo = await tx.documentoSiniestro.findUnique({ where: { idCarga } })
        if (!previo) return null
        if (
          previo.eliminado ||
          previo.idSiniestro !== id ||
          previo.idUsuario !== usuario.id ||
          previo.hashContenido !== hashContenido ||
          previo.nombreOriginal !== archivo.nombreOriginal
        )
          throw new HttpError(
            409,
            'Ese identificador ya pertenece a otra carga. Volvé a seleccionar el archivo.',
          )
        return { id: previo.id, reutilizado: true }
      }
      const previo = await deps.transaccion(async (tx) => {
        await comprobar(tx, usuario, id)
        return existente(tx)
      })
      if (previo) return previo
      const { objeto, imagen, claves } = await subirDocumentoProcesado(
        deps.almacenamiento(),
        archivo,
        `siniestros/${id}`,
      )
      let conservar = false
      try {
        return await deps
          .transaccion(async (tx) => {
            // Se revalida después de R2: pudo cambiar el responsable, cerrarse o darse de baja el caso.
            const actor = await prepararEdicion(tx, usuario, id, { bloquearAutor: true })
            const registrado = await existente(tx)
            if (registrado) return registrado
            const fecha = reloj()
            const documento = await tx.documentoSiniestro.create({
              data: {
                idCarga,
                hashContenido,
                ...datosImagenEnBase(objeto.clave, imagen),
                nombreOriginal: archivo.nombreOriginal,
                urlArchivoSinDominio: objeto.clave,
                tipoExtension: objeto.tipoExtension,
                mimeType: objeto.mimeType,
                tamanoBytes: objeto.tamanoBytes,
                idUsuario: usuario.id,
                idSiniestro: id,
                fechaCarga: fecha,
              },
              select: { id: true },
            })
            await tx.historialSiniestro.create({
              data: {
                idSiniestro: id,
                idUsuario: usuario.id,
                fechaEvento: fecha,
                ...eventoHistorial.documentoSubido(actor, archivo.nombreOriginal, fecha),
              },
            })
            await registrarMovimiento(tx, id, fecha)
            const caso = await tx.siniestro.findUniqueOrThrow({
              where: { id },
              select: { idUsuario: true, numeroSiniestro: true },
            })
            const destinatarios = await tx.usuario.findMany({
              where: {
                eliminado: false,
                id: { not: usuario.id },
                OR: [
                  { id: caso.idUsuario },
                  { tipoUsuario: { in: ['ADMINISTRADOR', 'SUPER_ADMINISTRADOR'] } },
                ],
              },
              select: { id: true },
            })
            if (destinatarios.length)
              await tx.notificacion.createMany({
                data: destinatarios.map((destinatario) => ({
                  idUsuario: destinatario.id,
                  idSiniestro: id,
                  tipoNotificacion: TipoNotificacion.DOCUMENTO_NUEVO,
                  mensaje: `${nombreCompleto(actor)} cargó el documento «${archivo.nombreOriginal}» en el siniestro ${caso.numeroSiniestro}.`,
                  fechaCreacion: fecha,
                  leida: false,
                  revisada: false,
                })),
              })
            return { id: documento.id, reutilizado: false }
          })
          .then((resultado) => {
            conservar = !resultado.reutilizado
            return resultado
          })
      } catch (error) {
        if (error instanceof HttpError) throw error
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
          throw new HttpError(409, 'La carga ya se está registrando. Reintentá este archivo.')
        throw new HttpError(
          503,
          'No se pudo registrar el documento. Reintentá este archivo; los demás se conservan.',
        )
      } finally {
        if (!conservar) {
          for (const clave of claves)
            try {
              // Si se perdió la confirmación del commit, el documento puede existir. Nunca borrar
              // un objeto referenciado; si la base no responde, dejarlo pendiente de limpieza.
              const registrado = await deps.transaccion((tx) =>
                tx.documentoSiniestro.findFirst({
                  where: {
                    OR: [
                      { urlArchivoSinDominio: clave },
                      { claveImagenOptimizada: clave },
                      { claveMiniatura: clave },
                    ],
                  },
                  select: { id: true },
                }),
              )
              if (!registrado) await deps.almacenamiento().eliminar(clave)
            } catch {
              console.error('Objeto pendiente de limpieza en R2:', clave)
            }
        }
      }
    },
  }
}
