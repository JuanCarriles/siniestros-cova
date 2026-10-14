// Datos de referencia que el sistema necesita para funcionar, en desarrollo y en producción.

export const PAIS_ARGENTINA = 'Argentina'

// Las 23 provincias más la Ciudad Autónoma de Buenos Aires (24 jurisdicciones),
// con sus nombres oficiales.
export const PROVINCIAS_ARGENTINA = [
  'Buenos Aires',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Ciudad Autónoma de Buenos Aires',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego, Antártida e Islas del Atlántico Sur',
  'Tucumán',
] as const

// En el orden del flujo del caso: en una base nueva los ids quedan en este mismo orden.
// esCierre marca el estado final; las reglas de negocio (RF-14, RF-18, RF-19, RF-30) usan la bandera, no el nombre.
export const ESTADOS_SINIESTRO = [
  {
    nombre: 'En tratamiento',
    descripcion:
      'Caso asignado y en tratamiento. El siniestro ya tiene Usuario asignado y se está trabajando en el caso.',
  },
  {
    nombre: 'Esperando documentación',
    descripcion:
      'A la espera de documentación. Se pidió documentación al asegurado, al tercero o a la aseguradora y todavía no llegó.',
  },
  {
    nombre: 'En pericia',
    descripcion: 'Un perito (CESVI o médico) está evaluando los daños del vehículo o las lesiones.',
  },
  {
    nombre: 'En negociación',
    descripcion: 'Se está acordando el monto o las condiciones con el tercero o con su abogado.',
  },
  {
    nombre: 'Cierre pendiente',
    descripcion:
      'A la espera de documentación para cierre. Hay acuerdo, pero falta recibir la documentación necesaria para cerrar el caso.',
  },
  {
    nombre: 'Solicitud de cierre',
    descripcion:
      'El gestor terminó toda la documentación del caso y le pide al administrador que confirme y envíe el cierre.',
  },
  {
    nombre: 'Cierre enviado',
    descripcion:
      'Informe completado y enviado. El informe del caso está terminado y ya se envió a la aseguradora.',
    esCierre: true,
  },
] as const

export const TIPOS_DOCUMENTO = [
  'DNI Tarjeta',
  'Pasaporte argentino',
  'DNI Libreta Verde / Celeste',
  'Otro',
] as const
