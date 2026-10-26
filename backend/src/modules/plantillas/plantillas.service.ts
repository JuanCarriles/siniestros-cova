import {
  altaPlantillaSchema,
  MENSAJE_ERROR_ELIMINAR_PLANTILLA,
  type AltaPlantillaInput,
  type PlantillaListado,
} from '@cova/shared/schemas/plantillas'
import type { Prisma } from '../../generated/prisma/client.ts'
import type { AlmacenamientoR2, ArchivoEntrada } from '../../lib/r2.ts'
import { HttpError } from '../../utils/httpError.ts'
import { validarArchivoPlantilla } from './validar-archivo.ts'

type BasePlantillas = Pick<Prisma.TransactionClient, 'usuario' | 'documentoPlantilla'>
const seleccion = {
  id: true,
  encabezado: true,
  descripcion: true,
  nombreOriginal: true,
  tipoExtension: true,
  tamanoBytes: true,
  fechaCarga: true,
  usuario: { select: { id: true, nombres: true, apellidos: true } },
} satisfies Prisma.DocumentoPlantillaSelect
type Fila = Prisma.DocumentoPlantillaGetPayload<{ select: typeof seleccion }>
const presentar = (fila: Fila): PlantillaListado => ({
  id: fila.id,
  encabezado: fila.encabezado,
  descripcion: fila.descripcion,
  nombreOriginal: fila.nombreOriginal,
  tipoExtension: fila.tipoExtension,
  tamanoBytes: fila.tamanoBytes === null ? null : Number(fila.tamanoBytes),
  fechaCarga: fila.fechaCarga.toISOString(),
  subidoPor: {
    id: fila.usuario.id,
    nombres: fila.usuario.nombres,
    apellidos: fila.usuario.apellidos,
  },
})

export function crearServicioPlantillas(deps: {
  prisma: BasePlantillas
  almacenamiento: () => AlmacenamientoR2
}) {
  const { prisma, almacenamiento } = deps
  async function autorizar(idUsuario: number, accion?: 'cargar' | 'eliminar') {
    const actor = await prisma.usuario.findFirst({
      where: { id: idUsuario, eliminado: false },
      select: { tipoUsuario: true },
    })
    if (!actor) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
    if (accion && actor.tipoUsuario === 'GESTOR') {
      throw new HttpError(
        403,
        accion === 'eliminar'
          ? 'Solo administradores y superadministradores pueden eliminar plantillas.'
          : 'Solo administradores y superadministradores pueden cargar plantillas.',
      )
    }
  }
  return {
    async listar(idUsuario: number) {
      await autorizar(idUsuario)
      const filas = await prisma.documentoPlantilla.findMany({
        where: { eliminado: false },
        select: seleccion,
        orderBy: [{ fechaCarga: 'desc' }, { id: 'desc' }],
      })
      return filas.map(presentar)
    },
    async subir(idUsuario: number, entrada: AltaPlantillaInput, archivo: ArchivoEntrada) {
      await autorizar(idUsuario, 'cargar')
      const datos = altaPlantillaSchema.parse(entrada)
      await validarArchivoPlantilla(archivo)
      const r2 = almacenamiento()
      const objeto = await r2.subir(archivo, 'plantillas')
      try {
        // Se vuelve a comprobar el rol tras la transferencia a R2.
        await autorizar(idUsuario, 'cargar')
        const fila = await prisma.documentoPlantilla.create({
          data: {
            ...datos,
            idUsuario,
            nombreOriginal: objeto.nombreOriginal,
            urlArchivo: objeto.clave,
            tipoExtension: objeto.tipoExtension,
            tamanoBytes: objeto.tamanoBytes,
          },
          select: seleccion,
        })
        return presentar(fila)
      } catch (error) {
        try {
          await r2.eliminar(objeto.clave)
        } catch {
          console.error('Plantilla pendiente de limpieza en R2:', objeto.clave)
        }
        if (error instanceof HttpError) throw error
        throw new HttpError(503, 'No se pudo registrar la plantilla. Intentá cargarla nuevamente.')
      }
    },
    async eliminar(idUsuario: number, id: number) {
      await autorizar(idUsuario, 'eliminar')
      const fila = await prisma.documentoPlantilla.findFirst({
        where: { id, eliminado: false },
        select: { id: true, urlArchivo: true },
      })
      // Idempotente: una plantilla ya eliminada no da error.
      if (!fila) return
      // R2 primero: si falla, conservamos el registro para reintentar.
      // DeleteObject también admite que el archivo haya sido eliminado desde Cloudflare.
      await almacenamiento().eliminar(fila.urlArchivo)
      try {
        await prisma.documentoPlantilla.deleteMany({
          where: { id: fila.id, urlArchivo: fila.urlArchivo },
        })
      } catch {
        // Si R2 borró pero la base falló, un reintento completa la limpieza (DeleteObject es idempotente).
        throw new HttpError(503, MENSAJE_ERROR_ELIMINAR_PLANTILLA)
      }
    },
    async descargar(idUsuario: number, id: number) {
      await autorizar(idUsuario)
      const fila = await prisma.documentoPlantilla.findFirst({
        where: { id, eliminado: false },
        select: { urlArchivo: true, nombreOriginal: true },
      })
      if (!fila) throw new HttpError(404, 'La plantilla ya no está disponible.')
      const r2 = almacenamiento()
      await r2.comprobarExistencia(fila.urlArchivo)
      return r2.firmarDescarga(fila.urlArchivo, fila.nombreOriginal)
    },
  }
}
