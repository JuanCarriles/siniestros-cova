import type { SesionUsuario } from '@cova/shared/schemas/auth'
import type { ModificarPerito, ParteCreada } from '@cova/shared/schemas/partes-siniestro'
import {
  TIPOS_PERITO,
  hoyArgentina,
  type PeritoAltaData,
} from '@cova/shared/schemas/siniestros-alta'
import { HttpError } from '../../../utils/httpError.ts'
import { eventoHistorial } from '../../historial/historial.textos.ts'
import { datosPerito, diaArgentina } from '../partes-datos.ts'
import {
  camposCambiados,
  exigirRevision,
  prepararEdicion,
  registrarMovimiento,
  type Transaccion,
  type Tx,
} from '../partes-edicion.ts'

/** Cómo se nombra cada dato en el historial cuando cambia (cerrado sale de la fecha de cierre) */
const ETIQUETAS: Record<Exclude<keyof ReturnType<typeof datosPerito>, 'cerrado'>, string> = {
  nombre: 'nombre',
  telefono: 'teléfono',
  email: 'email',
  fechaSolicitud: 'fecha de solicitud',
  fechaCierre: 'fecha de cierre',
}

/** Las fechas guardadas, llevadas al mediodía de su día en la Argentina: así se comparan con las del formulario */
const alMediodia = (fecha: Date) => diaArgentina(hoyArgentina(fecha))

async function buscarPerito(tx: Tx, idSiniestro: number, idPerito: number) {
  const perito = await tx.perito.findFirst({
    where: { id: idPerito, idSiniestro, eliminado: false },
  })
  if (!perito)
    throw new HttpError(404, 'Ese perito ya no está en el siniestro. Actualizá la página.')
  return perito
}

// CU-10 1.e (E5-07): peritos desde la ficha, con las reglas del alta (uno CESVI y uno médico como máximo). Cada
// cambio queda en el historial. Registrar el cierre de una pericia (pasa de pendiente a cerrada, al cargarla o al
// modificarla) cuenta como movimiento del caso; corregir la fecha de un cierre ya registrado o reabrirla, no.
export function crearServicioPeritosGestion({ transaccion }: { transaccion: Transaccion }) {
  return {
    async agregar(
      usuario: SesionUsuario,
      idSiniestro: number,
      datos: PeritoAltaData,
    ): Promise<ParteCreada> {
      return transaccion(async (tx) => {
        const autor = await prepararEdicion(tx, usuario, idSiniestro)
        const delTipo = await tx.perito.count({
          where: { idSiniestro, tipoPerito: datos.tipoPerito, eliminado: false },
        })
        if (delTipo)
          throw new HttpError(
            409,
            `Este siniestro ya tiene un perito ${TIPOS_PERITO[datos.tipoPerito].toLocaleLowerCase('es')}. Modificalo o dalo de baja antes de cargar otro.`,
          )
        const ahora = new Date()
        const { id } = await tx.perito.create({
          data: { idSiniestro, tipoPerito: datos.tipoPerito, ...datosPerito(datos) },
          select: { id: true },
        })
        if (datos.cerrado) await registrarMovimiento(tx, idSiniestro, ahora)
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            ...eventoHistorial.peritoAgregado(
              autor,
              datos.tipoPerito,
              datos.nombre,
              datos.cerrado,
              ahora,
            ),
          },
        })
        return { id }
      })
    },

    async modificar(
      usuario: SesionUsuario,
      idSiniestro: number,
      idPerito: number,
      { revision, datos }: ModificarPerito,
    ) {
      await transaccion(async (tx) => {
        const autor = await prepararEdicion(tx, usuario, idSiniestro)
        const actual = await buscarPerito(tx, idSiniestro, idPerito)
        if (datos.tipoPerito !== actual.tipoPerito)
          throw new HttpError(
            400,
            'El tipo de perito no se puede cambiar. Dalo de baja y cargá uno del otro tipo.',
          )
        const nuevos = datosPerito(datos)
        const guardados = {
          ...actual,
          fechaSolicitud: alMediodia(actual.fechaSolicitud),
          fechaCierre: actual.fechaCierre && alMediodia(actual.fechaCierre),
        }
        const campos = camposCambiados(guardados, nuevos, ETIQUETAS)
        // Sin diferencias con lo guardado no pisa nada, aunque el formulario sea viejo
        if (campos.length === 0) return
        exigirRevision(actual.revision, revision, `los datos del perito ${actual.nombre}`)
        const ahora = new Date()
        await tx.perito.update({
          where: { id: idPerito },
          data: { ...nuevos, revision: { increment: 1 } },
        })
        const cierre = !actual.cerrado && nuevos.cerrado
        if (cierre) await registrarMovimiento(tx, idSiniestro, ahora)
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            // Con el nombre de antes: si cambió, el historial dice de quién era el dato
            ...(cierre
              ? eventoHistorial.periciaCerrada(
                  autor,
                  actual.tipoPerito,
                  actual.nombre,
                  campos.filter((c) => c !== ETIQUETAS.fechaCierre),
                  ahora,
                )
              : eventoHistorial.peritoModificado(
                  autor,
                  actual.tipoPerito,
                  actual.nombre,
                  campos,
                  ahora,
                )),
          },
        })
      })
    },

    async darDeBaja(usuario: SesionUsuario, idSiniestro: number, idPerito: number) {
      await transaccion(async (tx) => {
        const autor = await prepararEdicion(tx, usuario, idSiniestro)
        const actual = await buscarPerito(tx, idSiniestro, idPerito)
        await tx.perito.update({
          where: { id: idPerito },
          data: { eliminado: true, fechaBaja: new Date() },
        })
        await tx.historialSiniestro.create({
          data: {
            idSiniestro,
            idUsuario: usuario.id,
            ...eventoHistorial.peritoDadoDeBaja(
              autor,
              actual.tipoPerito,
              actual.nombre,
              new Date(),
            ),
          },
        })
      })
    },
  }
}
