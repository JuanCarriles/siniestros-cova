import assert from 'node:assert/strict'

// Decisiones explícitas del informe: no actualizar automáticamente desde Prisma ni desde information_schema.
// Si cambia Siniestro, revisar el impacto, el SQL y docs/TRIGGERS.md antes de modificar este contrato.
export const columnasFotoSiniestro = {
  id: 'id',
  numeroSiniestro: 'numero',
  fechaAsignacion: 'ingreso',
  fechaOcurrencia: 'ocurrencia',
  idEstadoSiniestro: 'estado.id',
  idAseguradora: 'aseguradora.id',
  idAjustador: 'ajustador',
  idUsuario: 'gestor.id',
  eliminado: 'eliminado',
  fechaCierre: 'fechaCierre',
  fechaUltimoMovimiento: 'ultimoMovimiento',
  menorEdadInvolucrado: 'menores',
  moneda: 'moneda',
  montoReclamado: 'reclamado',
  montoAcordado: 'acordado',
  resultadoCierre: 'resultado',
}
// Estos cambios generan DATOS, pero su contenido no se copia: no hay indicador que lo necesite.
export const columnasEventoSinContenido = {
  numeroPoliza: 'Identificador de póliza; la foto usa el número del siniestro.',
  horaOcurrencia: 'La demora de ingreso usa la fecha, no la hora.',
  inicioVigencia: 'La vigencia no integra los indicadores actuales.',
  sucursal: 'Sin desglose por sucursal en esta versión.',
  causa: 'No guardar el relato del hecho en el registro estadístico.',
  idDireccion: 'No duplicar domicilios ni sus identificadores en el informe.',
  fechaBaja: 'La baja se reconstruye con el evento y su fecha; la foto guarda eliminado.',
}
// Deben quedar fuera de cova_estadistica_caso: no son actividad ni cambios de negocio.
export const columnasTecnicasSiniestro = {
  revision: 'Control de concurrencia de edición.',
  eliminacionEnCurso: 'Concesión de eliminación externa.',
  carpetaR2: 'Reserva de almacenamiento; reorganizar no altera indicadores.',
}
export function verificarColumnasEstadisticas(columnas) {
  const decididas = [
    ...Object.keys(columnasFotoSiniestro),
    ...Object.keys(columnasEventoSinContenido),
    ...Object.keys(columnasTecnicasSiniestro),
  ]
  assert.equal(
    new Set(decididas).size,
    decididas.length,
    'Cada columna debe tener una sola decisión estadística',
  )
  assert.deepEqual(
    [...columnas].sort(),
    decididas.sort(),
    'Cambió Siniestro: decidir si cada columna entra en la foto, solo dispara DATOS o es técnica; revisar SQL y docs/TRIGGERS.md',
  )
}
