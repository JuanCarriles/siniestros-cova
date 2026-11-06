import { TipoEventoHistorial, type TipoPerito } from '../../generated/prisma/client.ts'
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
  modificacionDatos: (cambios: string[]) =>
    evento(
      TipoEventoHistorial.MODIFICACION_DATOS,
      `Se modificaron datos del caso: ${cambios.join('; ')}.`,
    ),
  /**
   * "María Rearte dio de alta el siniestro el 20/10/2026" (E5-09). Es el primer evento de cada siniestro dado de alta
   * desde esta historia. Los cargados antes no lo tienen y no se reconstruye: la ficha avisa que su historial puede
   * estar incompleto.
   */
  altaSiniestro: (autor: Persona, fecha: Date) =>
    evento(
      TipoEventoHistorial.ALTA_SINIESTRO,
      `${nombreCompleto(autor)} dio de alta el siniestro el ${formatearFecha(fecha)}`,
    ),
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

  /** Baja lógica: conserva el archivo y registra el motivo en el historial. */
  documentoDadoDeBaja: (autor: Persona, nombreArchivo: string, motivo: string, fecha: Date) =>
    evento(
      TipoEventoHistorial.DOCUMENTO,
      `${nombreCompleto(autor)} dio de baja el documento "${nombreArchivo}" el ${formatearFecha(fecha)}. Motivo: ${motivo}`,
    ),

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

  // Partes desde la ficha (CU-10 1.c, E5-06). De una modificación se nombran los campos que cambiaron, sin sus
  // valores: el historial no repite datos personales.

  /** "Pedro González agregó el vehículo AE123CD el 20/10/2026" */
  vehiculoAgregado: (autor: Persona, dominio: string, fecha: Date) =>
    evento(
      TipoEventoHistorial.VEHICULO,
      `${nombreCompleto(autor)} agregó el vehículo ${dominio} el ${formatearFecha(fecha)}`,
    ),
  /** "Pedro González modificó el vehículo AE123CD (color y daños) el 20/10/2026" */
  vehiculoModificado: (autor: Persona, dominio: string, campos: string[], fecha: Date) =>
    evento(
      TipoEventoHistorial.VEHICULO,
      `${nombreCompleto(autor)} modificó el vehículo ${dominio} (${enumerar(campos)}) el ${formatearFecha(fecha)}`,
    ),
  /** "Pedro González dio de baja el vehículo AE123CD el 20/10/2026" */
  vehiculoDadoDeBaja: (autor: Persona, dominio: string, fecha: Date) =>
    evento(
      TipoEventoHistorial.VEHICULO,
      `${nombreCompleto(autor)} dio de baja el vehículo ${dominio} el ${formatearFecha(fecha)}`,
    ),

  /** "Pedro González agregó a Ana Ruiz como titular del vehículo AE123CD el 20/10/2026" */
  personaAgregada: (autor: Persona, persona: string, como: string, fecha: Date) =>
    evento(
      TipoEventoHistorial.PERSONA,
      `${nombreCompleto(autor)} agregó a ${persona} como ${como} el ${formatearFecha(fecha)}`,
    ),
  /** "Pedro González modificó los datos de Ana Ruiz, titular del vehículo AE123CD (documento y teléfono) el 20/10/2026" */
  personaModificada: (
    autor: Persona,
    persona: string,
    como: string,
    campos: string[],
    fecha: Date,
  ) =>
    evento(
      TipoEventoHistorial.PERSONA,
      `${nombreCompleto(autor)} modificó los datos de ${persona}, ${como} (${enumerar(campos)}) el ${formatearFecha(fecha)}`,
    ),
  /** "Pedro González dio de baja a Ana Ruiz, titular del vehículo AE123CD, el 20/10/2026" */
  personaDadaDeBaja: (autor: Persona, persona: string, como: string, fecha: Date) =>
    evento(
      TipoEventoHistorial.PERSONA,
      `${nombreCompleto(autor)} dio de baja a ${persona}, ${como}, el ${formatearFecha(fecha)}`,
    ),

  // Abogados y peritos desde la ficha (CU-10 1.d y 1.e, E5-07)

  /** "Pedro González agregó al abogado Luis Maidana, que representa a Ana Ruiz y Juan Paz, el 20/10/2026" */
  abogadoAgregado: (autor: Persona, abogado: string, representados: string[], fecha: Date) =>
    evento(
      TipoEventoHistorial.ABOGADO,
      `${nombreCompleto(autor)} agregó al abogado ${abogado}, que representa a ${enumerar(representados)}, el ${formatearFecha(fecha)}`,
    ),
  /** "Pedro González modificó los datos del abogado Luis Maidana (teléfono y a quién representa) el 20/10/2026" */
  abogadoModificado: (autor: Persona, abogado: string, campos: string[], fecha: Date) =>
    evento(
      TipoEventoHistorial.ABOGADO,
      `${nombreCompleto(autor)} modificó los datos del abogado ${abogado} (${enumerar(campos)}) el ${formatearFecha(fecha)}`,
    ),
  /** "Pedro González dio de baja al abogado Luis Maidana el 20/10/2026" */
  abogadoDadoDeBaja: (autor: Persona, abogado: string, fecha: Date) =>
    evento(
      TipoEventoHistorial.ABOGADO,
      `${nombreCompleto(autor)} dio de baja al abogado ${abogado} el ${formatearFecha(fecha)}`,
    ),

  /** "Pedro González cargó al perito CESVI Juan Pérez el 20/10/2026" (cerrada: "…con la pericia cerrada…") */
  peritoAgregado: (
    autor: Persona,
    tipo: TipoPerito,
    perito: string,
    cerrada: boolean,
    fecha: Date,
  ) =>
    evento(
      TipoEventoHistorial.PERITO,
      `${nombreCompleto(autor)} cargó al ${PERITO[tipo]} ${perito}${cerrada ? ' con la pericia cerrada' : ''} el ${formatearFecha(fecha)}`,
    ),
  /** "Pedro González modificó los datos del perito médico Juan Pérez (teléfono) el 20/10/2026" */
  peritoModificado: (
    autor: Persona,
    tipo: TipoPerito,
    perito: string,
    campos: string[],
    fecha: Date,
  ) =>
    evento(
      TipoEventoHistorial.PERITO,
      `${nombreCompleto(autor)} modificó los datos del ${PERITO[tipo]} ${perito} (${enumerar(campos)}) el ${formatearFecha(fecha)}`,
    ),
  /**
   * "Pedro González registró el cierre de la pericia médica de Juan Pérez el 20/10/2026". Si también cambió otros
   * datos: "…de Juan Pérez y modificó teléfono el 20/10/2026".
   */
  periciaCerrada: (
    autor: Persona,
    tipo: TipoPerito,
    perito: string,
    otrosCampos: string[],
    fecha: Date,
  ) =>
    evento(
      TipoEventoHistorial.PERITO,
      `${nombreCompleto(autor)} registró el cierre de la ${PERICIA[tipo]} de ${perito}${otrosCampos.length ? ` y modificó ${enumerar(otrosCampos)}` : ''} el ${formatearFecha(fecha)}`,
    ),
  /** "Pedro González dio de baja al perito CESVI Juan Pérez el 20/10/2026" */
  peritoDadoDeBaja: (autor: Persona, tipo: TipoPerito, perito: string, fecha: Date) =>
    evento(
      TipoEventoHistorial.PERITO,
      `${nombreCompleto(autor)} dio de baja al ${PERITO[tipo]} ${perito} el ${formatearFecha(fecha)}`,
    ),
}

const PERITO: Record<TipoPerito, string> = { CESVI: 'perito CESVI', MEDICO: 'perito médico' }
const PERICIA: Record<TipoPerito, string> = { CESVI: 'pericia CESVI', MEDICO: 'pericia médica' }

/** "dominio", "dominio y color", "dominio, color y daños" */
function enumerar(campos: string[]): string {
  return campos.length <= 1
    ? (campos[0] ?? '')
    : `${campos.slice(0, -1).join(', ')} y ${campos[campos.length - 1]}`
}
