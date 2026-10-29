import { TipoEventoHistorial } from '../../generated/prisma/client.ts'
import { formatearFecha, nombreCompleto } from '../../utils/formato.ts'

// Arma cada evento del historial del siniestro (RF-11, RF-12, RF-20): el tipo y un texto que
// describe la situación tal como era en ese momento. No se guardan ids ni datos del cambio:
// si después se renombra un usuario o un estado, el historial conserva lo que pasó.
// Quién hizo la acción queda en HistorialSiniestro.idUsuario y la hora exacta en fechaEvento.
//
// Uso:
//   await tx.historialSiniestro.create({
//     data: { idSiniestro, idUsuario, ...eventoHistorial.asignacion(usuario, new Date()) },
//   })

type Persona = { nombres: string; apellidos: string }

export interface EventoHistorial {
  tipoEvento: TipoEventoHistorial
  descripcion: string
}

const evento = (tipoEvento: TipoEventoHistorial, descripcion: string): EventoHistorial => ({
  tipoEvento,
  descripcion,
})

export const eventoHistorial = {
  bajaSiniestro: (autor: Persona, fecha: Date) =>
    evento(
      TipoEventoHistorial.BAJA_SINIESTRO,
      `${nombreCompleto(autor)} dio de baja lógica el siniestro el ${formatearFecha(fecha)}`,
    ),
  reactivacionSiniestro: (autor: Persona, fecha: Date) =>
    evento(
      TipoEventoHistorial.REACTIVACION_SINIESTRO,
      `${nombreCompleto(autor)} reactivó el siniestro el ${formatearFecha(fecha)}`,
    ),
  /** "Se asignó el caso al usuario Pedro González el 20/10/2026" */
  asignacion: (asignado: Persona, fecha: Date) =>
    evento(
      TipoEventoHistorial.ASIGNACION,
      `Se asignó el caso al usuario ${nombreCompleto(asignado)} el ${formatearFecha(fecha)}`,
    ),

  /** "Se reasignó el caso de Pedro González a Ana Ruiz el 20/10/2026" */
  reasignacion: (anterior: Persona, nuevo: Persona, fecha: Date) =>
    evento(
      TipoEventoHistorial.REASIGNACION,
      `Se reasignó el caso de ${nombreCompleto(anterior)} a ${nombreCompleto(nuevo)} el ${formatearFecha(fecha)}`,
    ),

  /** 'Se cambió el estado de "En pericia" a "En negociación" el 20/10/2026' */
  cambioEstado: (estadoAnterior: string, estadoNuevo: string, fecha: Date) =>
    evento(
      TipoEventoHistorial.CAMBIO_ESTADO,
      `Se cambió el estado de "${estadoAnterior}" a "${estadoNuevo}" el ${formatearFecha(fecha)}`,
    ),

  /** "Pedro González cargó una novedad el 20/10/2026" */
  novedad: (autor: Persona, fecha: Date) =>
    evento(
      TipoEventoHistorial.NOVEDAD,
      `${nombreCompleto(autor)} cargó una novedad el ${formatearFecha(fecha)}`,
    ),

  /** 'Pedro González subió el documento "Acta policial.pdf" el 20/10/2026' */
  documentoSubido: (autor: Persona, nombreArchivo: string, fecha: Date) =>
    evento(
      TipoEventoHistorial.DOCUMENTO,
      `${nombreCompleto(autor)} subió el documento "${nombreArchivo}" el ${formatearFecha(fecha)}`,
    ),

  /** 'Pedro González eliminó el documento "Acta policial.pdf" el 20/10/2026' (RF-22) */
  documentoEliminado: (autor: Persona, nombreArchivo: string, fecha: Date) =>
    evento(
      TipoEventoHistorial.DOCUMENTO,
      `${nombreCompleto(autor)} eliminó el documento "${nombreArchivo}" el ${formatearFecha(fecha)}`,
    ),

  /** "Pedro González envió un mensaje en el chat el 20/10/2026" */
  mensaje: (autor: Persona, fecha: Date) =>
    evento(
      TipoEventoHistorial.MENSAJE,
      `${nombreCompleto(autor)} envió un mensaje en el chat el ${formatearFecha(fecha)}`,
    ),
}
