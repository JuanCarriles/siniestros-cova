// Datos ficticios SOLO para desarrollo. Nunca correr en producción (seed-dev.ts lo impide).
// Nombres, documentos, teléfonos, dominios y mails son inventados; los mails usan el dominio
// reservado .test, que no existe, así que ningún correo puede llegar a una persona real.
import {
  RolAccidente,
  TipoLesion,
  TipoNotificacion,
  TipoPerito,
  TipoUsuario,
  UsoVehiculo,
  type Prisma,
} from '../../src/generated/prisma/client.ts'
import {
  eventoHistorial,
  type EventoHistorial,
} from '../../src/modules/historial/historial.textos.ts'
import { nombreCompleto } from '../../src/utils/formato.ts'

type Tx = Prisma.TransactionClient

// ------------------------------------------------------------------------------------- Usuarios

// Credenciales de prueba para iniciar sesión en desarrollo (una por tipo de usuario).
export const USUARIOS_DEV = [
  {
    email: 'superadmin@cova.test',
    contrasena: 'SuperAdmin.2026',
    nombres: 'Laura',
    apellidos: 'Ferreyra',
    documento: '25111222',
    telefono: '341 555-0101',
    tipoUsuario: TipoUsuario.SUPER_ADMINISTRADOR,
    direccion: {
      provincia: 'Santa Fe',
      localidad: 'Rosario',
      calle: 'Córdoba 1452',
      pisoDepartamento: '3° B',
      codigoPostal: '2000',
    },
  },
  {
    email: 'admin@cova.test',
    contrasena: 'Admin.2026',
    nombres: 'María',
    apellidos: 'Rearte',
    documento: '30222333',
    telefono: '341 555-0102',
    tipoUsuario: TipoUsuario.ADMINISTRADOR,
    direccion: {
      provincia: 'Santa Fe',
      localidad: 'Rosario',
      calle: 'Mitre 830',
      pisoDepartamento: '1° A',
      codigoPostal: '2000',
    },
  },
  {
    email: 'gestor@cova.test',
    contrasena: 'Gestor.2026',
    nombres: 'Marcelo',
    apellidos: 'Pintos',
    documento: '33444555',
    telefono: '341 555-0103',
    tipoUsuario: TipoUsuario.GESTOR,
    direccion: {
      provincia: 'Santa Fe',
      localidad: 'Funes',
      calle: 'Hipólito Yrigoyen 2210',
      codigoPostal: '2132',
    },
  },
] as const

type EmailDev = (typeof USUARIOS_DEV)[number]['email']

// ------------------------------------------------------------------------ Aseguradoras y otros

const ASEGURADORAS = [
  {
    nombre: 'Litoral Seguros',
    ajustadores: [
      { nombres: 'Ricardo', apellidos: 'Bengoechea', telefono: '341 555-0201' },
      { nombres: 'Carla', apellidos: 'Méndez', telefono: '341 555-0202' },
      // Dado de baja (sin siniestros activos): para probar la reactivación (CU03 3.c)
      { nombres: 'Hernán', apellidos: 'Sosa', telefono: '341 555-0203', baja: true },
    ],
  },
  {
    nombre: 'Sancor Seguros',
    ajustadores: [
      { nombres: 'Diego', apellidos: 'Ruiz', telefono: '3493 555-0204' },
      { nombres: 'Andrea', apellidos: 'Paz', telefono: '3493 555-0205' },
    ],
  },
  {
    nombre: 'La Segunda',
    ajustadores: [{ nombres: 'Silvina', apellidos: 'Ortega', telefono: '341 555-0206' }],
  },
  {
    nombre: 'Federación Patronal',
    ajustadores: [{ nombres: 'Paula', apellidos: 'Ríos', telefono: '221 555-0207' }],
  },
  // Dada de baja y sin ajustadores: para probar la reactivación (CU02 3.c)
  { nombre: 'Seguros del Plata', baja: true, ajustadores: [] },
] as const

const ABOGADOS = [
  {
    nombreCompleto: 'Luis Maidana',
    numeroMatricula: '12345',
    telefono: '341 555-0301',
    email: 'lmaidana@estudio.test',
  },
  {
    nombreCompleto: 'Valeria Quintana',
    numeroMatricula: 'T° 45 F° 123',
    telefono: '11 5555-0302',
    email: 'vquintana@estudio.test',
  },
] as const

type NombreAbogado = (typeof ABOGADOS)[number]['nombreCompleto']

// ------------------------------------------------------------------------------------ Siniestros

interface DireccionDev {
  provincia: string
  localidad: string
  calle: string
  codigoPostal: string
  pisoDepartamento?: string
}

interface PersonaDev {
  nombre: string
  documento: string
  tipoDocumento: string
  sexo: 'Femenino' | 'Masculino'
  estadoCivil?: string
  fechaNacimiento: string // YYYY-MM-DD
  telefono?: string
  email?: string
  carnet?: { numero: string; vence: string }
  lesion?: { tipo: TipoLesion; descripcion: string }
  abogado?: NombreAbogado
  direccion?: DireccionDev
  // Dentro de un vehículo
  esPropietario?: boolean
  iba?: boolean
  rolEnVehiculo?: string
  relacionPropietario?: string
  // Fuera de los vehículos
  rolSinVehiculo?: string
}

interface VehiculoDev {
  rol: RolAccidente
  dominio: string
  marca: string
  modelo: string
  version: string
  anio: number
  color: string
  tipo: string
  uso: UsoVehiculo
  numeroChasis: string
  numeroMotor: string
  descripcionDanos: string
  acreedorPrendario?: string
  aseguradora?: string
  personas: PersonaDev[]
}

interface PeritoDev {
  tipo: TipoPerito
  nombre: string
  telefono: string
  email: string
  solicitadoHaceDias: number
  cerradoHaceDias?: number
}

// "asignado" = usuario a cargo del siniestro; "supervisor" = la otra parte del chat
// (el administrador, o el super administrador si el caso lo lleva el administrador).
type Participante = 'asignado' | 'supervisor'

interface SiniestroDev {
  numero: string
  poliza: string
  inicioVigencia: string
  sucursal: string
  aseguradora: string
  ajustador: string
  usuario: EmailDev
  // Si estuvo asignado antes a otro usuario: genera la asignación original y la reasignación (RF-12)
  reasignadoDe?: EmailDev
  estado: string
  asignadoHaceDias: number
  ultimoMovimientoHaceDias: number
  cerradoHaceDias?: number
  ocurrioHaceDias: number
  hora: string // HH:MM
  causa: string
  menorEdadInvolucrado: boolean
  lugar: DireccionDev
  vehiculos: VehiculoDev[]
  personasSinVehiculo?: PersonaDev[]
  peritos?: PeritoDev[]
  novedades: string[]
  documentos: { nombre: string; por: Participante; kb: number }[]
  chat?: { de: Participante; texto: string }[]
  // El último mensaje queda sin leer por su destinatario (para probar pendientes y notificaciones)
  ultimoMensajeSinLeer?: boolean
}

const DNI = 'DNI Tarjeta'

const SINIESTROS: SiniestroDev[] = [
  {
    // El caso del HTML de referencia (docs/referencia-ui/ficha-siniestro.html)
    numero: '2026-04871',
    poliza: '01-AU-558812',
    inicioVigencia: '01/12/2025',
    sucursal: 'Rosario Centro',
    aseguradora: 'Litoral Seguros',
    ajustador: 'Ricardo Bengoechea',
    usuario: 'gestor@cova.test',
    estado: 'En pericia',
    asignadoHaceDias: 10,
    ultimoMovimientoHaceDias: 1,
    ocurrioHaceDias: 14,
    hora: '18:30',
    causa:
      'Colisión en intersección: el tercero no respetó el semáforo en rojo y embistió el lateral derecho del vehículo asegurado.',
    menorEdadInvolucrado: false,
    lugar: {
      provincia: 'Santa Fe',
      localidad: 'Rosario',
      calle: 'Av. Pellegrini y Bv. Oroño',
      codigoPostal: '2000',
    },
    vehiculos: [
      {
        rol: RolAccidente.ASEGURADO,
        dominio: 'AE123CD',
        marca: 'Toyota',
        modelo: 'Corolla',
        version: '2.0 XEI CVT',
        anio: 2021,
        color: 'Gris plata',
        tipo: 'Sedán 4 puertas',
        uso: UsoVehiculo.PARTICULAR,
        numeroChasis: '9BRBDWHE0M0012345',
        numeroMotor: 'M20A1234567',
        descripcionDanos:
          'Lateral derecho hundido: puertas delantera y trasera, zócalo y espejo. Rueda delantera derecha desalineada.',
        acreedorPrendario: 'Banco Ficticio S.A.',
        aseguradora: 'Litoral Seguros',
        personas: [
          {
            nombre: 'Gustavo Álvarez',
            documento: '28456789',
            tipoDocumento: DNI,
            sexo: 'Masculino',
            estadoCivil: 'Casado',
            fechaNacimiento: '1981-05-14',
            telefono: '341 555-1001',
            email: 'galvarez@correo.test',
            carnet: { numero: '28456789', vence: '2028-05-14' },
            esPropietario: true,
            iba: true,
            rolEnVehiculo: 'Conductor',
            direccion: {
              provincia: 'Santa Fe',
              localidad: 'Rosario',
              calle: 'San Lorenzo 2040',
              codigoPostal: '2000',
            },
          },
          {
            nombre: 'Lucía Álvarez',
            documento: '29876543',
            tipoDocumento: DNI,
            sexo: 'Femenino',
            estadoCivil: 'Casada',
            fechaNacimiento: '1983-09-02',
            relacionPropietario: 'Cónyuge',
            rolEnVehiculo: 'Acompañante',
            lesion: {
              tipo: TipoLesion.LEVE,
              descripcion: 'Cervicalgia por latigazo. Atendida en guardia y dada de alta.',
            },
          },
        ],
      },
      {
        rol: RolAccidente.TERCERO,
        dominio: 'AA456EF',
        marca: 'Volkswagen',
        modelo: 'Gol Trend',
        version: '1.6 Trendline',
        anio: 2016,
        color: 'Blanco',
        tipo: 'Hatchback 5 puertas',
        uso: UsoVehiculo.PARTICULAR,
        numeroChasis: '9BWAB45U0GT054321',
        numeroMotor: 'CFZ765432',
        descripcionDanos: 'Frente destruido: paragolpes, capot, ópticas y radiador.',
        aseguradora: 'Sancor Seguros',
        personas: [
          {
            // Titular que no iba en el vehículo: lo manejaba su hijo (novedad del 04/02 del mockup)
            nombre: 'Norma Quiroga',
            documento: '14555666',
            tipoDocumento: 'DNI Libreta Verde / Celeste',
            sexo: 'Femenino',
            estadoCivil: 'Viuda',
            fechaNacimiento: '1958-11-20',
            telefono: '341 555-1002',
            esPropietario: true,
            iba: false,
            abogado: 'Luis Maidana',
            direccion: {
              provincia: 'Santa Fe',
              localidad: 'Villa Gobernador Gálvez',
              calle: 'Belgrano 455',
              codigoPostal: '2124',
            },
          },
          {
            nombre: 'Federico Quiroga',
            documento: '38999111',
            tipoDocumento: DNI,
            sexo: 'Masculino',
            estadoCivil: 'Soltero',
            fechaNacimiento: '1994-03-08',
            telefono: '341 555-1003',
            carnet: { numero: '38999111', vence: '2027-03-08' },
            relacionPropietario: 'Hijo',
            rolEnVehiculo: 'Conductor',
          },
        ],
      },
    ],
    peritos: [
      {
        tipo: TipoPerito.CESVI,
        nombre: 'Ing. Pablo Giménez',
        telefono: '341 555-1101',
        email: 'pgimenez@cesvi.test',
        solicitadoHaceDias: 5,
      },
    ],
    novedades: [
      'Contacté a la Sra. Quiroga. Aportó los datos de su abogado, el Dr. Luis Maidana. No iba en el vehículo: lo manejaba su hijo.',
      'Se solicitó la pericia mecánica a Litoral Seguros. Quedamos a la espera de que asignen perito.',
      'Se inspeccionó el vehículo del asegurado en el taller de Rondeau 1240. Falta el informe firmado del mecánico para poder cerrar la pericia.',
    ],
    documentos: [
      { nombre: 'Denuncia administrativa.pdf', por: 'supervisor', kb: 1200 },
      { nombre: 'Acta policial.pdf', por: 'supervisor', kb: 860 },
      { nombre: 'Cédula verde asegurado.pdf', por: 'asignado', kb: 480 },
      { nombre: 'Carnet de conducir.jpg', por: 'asignado', kb: 1800 },
      { nombre: 'Frente izquierdo.jpg', por: 'asignado', kb: 2400 },
      { nombre: 'Presupuesto taller Rondeau.pdf', por: 'asignado', kb: 320 },
    ],
    chat: [
      { de: 'supervisor', texto: 'Marcelo, ¿pudiste pasar por el taller de Rondeau?' },
      {
        de: 'asignado',
        texto:
          'Sí, fui ayer a la tarde. Saqué fotos del frente y del lateral, ya las subí al expediente.',
      },
      { de: 'asignado', texto: 'El mecánico me dijo que el informe lo tiene listo el lunes.' },
      {
        de: 'supervisor',
        texto: 'Perfecto. Cuando lo tengas, cargalo y pasá el caso a Solicitud de cierre.',
      },
    ],
    ultimoMensajeSinLeer: true,
  },
  {
    numero: '2026-05102',
    poliza: '02-AU-771203',
    inicioVigencia: '15/03/2026',
    sucursal: 'Córdoba Capital',
    aseguradora: 'Sancor Seguros',
    ajustador: 'Diego Ruiz',
    usuario: 'gestor@cova.test',
    estado: 'En tratamiento',
    asignadoHaceDias: 1,
    ultimoMovimientoHaceDias: 0,
    ocurrioHaceDias: 3,
    hora: '08:15',
    causa: 'Choque por alcance: el tercero frenó de golpe y el asegurado lo embistió desde atrás.',
    menorEdadInvolucrado: false,
    lugar: {
      provincia: 'Córdoba',
      localidad: 'Córdoba',
      calle: 'Av. Colón 1200',
      codigoPostal: '5000',
    },
    vehiculos: [
      {
        rol: RolAccidente.ASEGURADO,
        dominio: 'AF789GH',
        marca: 'Fiat',
        modelo: 'Cronos',
        version: '1.3 Drive',
        anio: 2023,
        color: 'Rojo',
        tipo: 'Sedán 4 puertas',
        uso: UsoVehiculo.PARTICULAR,
        numeroChasis: '8AP359A0NPU112233',
        numeroMotor: 'FIRE13001122',
        descripcionDanos: 'Frente: paragolpes y capot deformados.',
        aseguradora: 'Sancor Seguros',
        personas: [
          {
            nombre: 'Romina Sánchez',
            documento: '35222444',
            tipoDocumento: DNI,
            sexo: 'Femenino',
            estadoCivil: 'Soltera',
            fechaNacimiento: '1990-07-21',
            telefono: '351 555-2001',
            email: 'rsanchez@correo.test',
            carnet: { numero: '35222444', vence: '2029-07-21' },
            esPropietario: true,
            iba: true,
            rolEnVehiculo: 'Conductora',
            direccion: {
              provincia: 'Córdoba',
              localidad: 'Córdoba',
              calle: 'Obispo Trejo 340',
              pisoDepartamento: '5° C',
              codigoPostal: '5000',
            },
          },
        ],
      },
      {
        rol: RolAccidente.TERCERO,
        dominio: 'AC321JK',
        marca: 'Renault',
        modelo: 'Kangoo',
        version: '1.6 Express',
        anio: 2018,
        color: 'Blanco',
        tipo: 'Utilitario',
        uso: UsoVehiculo.COMERCIAL,
        numeroChasis: '8A1FC1315JL998877',
        numeroMotor: 'K4MJ730998',
        descripcionDanos: 'Portón trasero y paragolpes trasero hundidos.',
        aseguradora: 'La Segunda',
        personas: [
          {
            nombre: 'Distribuidora Ficticia S.R.L.',
            documento: '30-71234567-8',
            tipoDocumento: 'Otro',
            sexo: 'Masculino',
            fechaNacimiento: '2010-01-01',
            telefono: '351 555-2002',
            esPropietario: true,
            iba: false,
          },
          {
            nombre: 'Hugo Ledesma',
            documento: '31777888',
            tipoDocumento: DNI,
            sexo: 'Masculino',
            fechaNacimiento: '1985-12-01',
            carnet: { numero: '31777888', vence: '2026-12-01' },
            relacionPropietario: 'Empleado',
            rolEnVehiculo: 'Conductor',
          },
        ],
      },
    ],
    novedades: ['Primer contacto con la asegurada. Envía fotos y denuncia durante el día.'],
    documentos: [{ nombre: 'Denuncia administrativa.pdf', por: 'supervisor', kb: 950 }],
  },
  {
    // Sin movimientos hace 5 días: demorado (RF-19, más de 72 h)
    numero: '2026-05230',
    poliza: '03-AU-330018',
    inicioVigencia: '01/02/2026',
    sucursal: 'Mendoza',
    aseguradora: 'La Segunda',
    ajustador: 'Silvina Ortega',
    usuario: 'gestor@cova.test',
    estado: 'Esperando documentación',
    asignadoHaceDias: 12,
    ultimoMovimientoHaceDias: 5,
    ocurrioHaceDias: 16,
    hora: '21:40',
    causa:
      'Al girar a la izquierda, el asegurado no vio la moto que venía de frente y la embistió.',
    menorEdadInvolucrado: false,
    lugar: {
      provincia: 'Mendoza',
      localidad: 'Godoy Cruz',
      calle: 'San Martín 1800',
      codigoPostal: '5501',
    },
    vehiculos: [
      {
        rol: RolAccidente.ASEGURADO,
        dominio: 'AD555LM',
        marca: 'Chevrolet',
        modelo: 'Onix',
        version: '1.0 Turbo LT',
        anio: 2022,
        color: 'Negro',
        tipo: 'Hatchback 5 puertas',
        uso: UsoVehiculo.PARTICULAR,
        numeroChasis: '9BGEA48A0NG445566',
        numeroMotor: 'L3T220445566',
        descripcionDanos: 'Guardabarros delantero izquierdo y óptica rota.',
        aseguradora: 'La Segunda',
        personas: [
          {
            nombre: 'Andrés Molina',
            documento: '32111999',
            tipoDocumento: DNI,
            sexo: 'Masculino',
            estadoCivil: 'Divorciado',
            fechaNacimiento: '1986-02-11',
            telefono: '261 555-3001',
            carnet: { numero: '32111999', vence: '2027-02-11' },
            esPropietario: true,
            iba: true,
            rolEnVehiculo: 'Conductor',
            direccion: {
              provincia: 'Mendoza',
              localidad: 'Mendoza',
              calle: 'Colón 560',
              codigoPostal: '5500',
            },
          },
        ],
      },
      {
        rol: RolAccidente.TERCERO,
        dominio: 'A123BCD',
        marca: 'Honda',
        modelo: 'Wave',
        version: '110 S',
        anio: 2020,
        color: 'Azul',
        tipo: 'Motocicleta',
        uso: UsoVehiculo.PARTICULAR,
        numeroChasis: 'LALJC6200L3001122',
        numeroMotor: 'JC62E3001122',
        descripcionDanos: 'Horquilla doblada, carenado y espejos rotos.',
        personas: [
          {
            nombre: 'Julián Correa',
            documento: '41222333',
            tipoDocumento: DNI,
            sexo: 'Masculino',
            estadoCivil: 'Soltero',
            fechaNacimiento: '1999-06-30',
            telefono: '261 555-3002',
            carnet: { numero: '41222333', vence: '2026-06-30' },
            esPropietario: true,
            iba: true,
            rolEnVehiculo: 'Conductor',
            abogado: 'Valeria Quintana',
            lesion: {
              tipo: TipoLesion.MODERADA,
              descripcion: 'Fractura de clavícula izquierda. Reposo de 45 días.',
            },
            direccion: {
              provincia: 'Mendoza',
              localidad: 'Godoy Cruz',
              calle: 'Tomba 920',
              codigoPostal: '5501',
            },
          },
        ],
      },
    ],
    peritos: [
      {
        tipo: TipoPerito.MEDICO,
        nombre: 'Dra. Mariela Funes',
        telefono: '261 555-3101',
        email: 'mfunes@medicos.test',
        solicitadoHaceDias: 8,
      },
    ],
    novedades: [
      'Se pidió al tercero el certificado médico y la historia clínica de la guardia.',
      'La abogada del tercero informa que la documentación llega la semana próxima.',
    ],
    documentos: [
      { nombre: 'Denuncia administrativa.pdf', por: 'supervisor', kb: 1100 },
      { nombre: 'Fotos del lugar.jpg', por: 'asignado', kb: 2900 },
    ],
    chat: [
      { de: 'supervisor', texto: '¿Novedades de la historia clínica del motociclista?' },
      { de: 'asignado', texto: 'Todavía no. La abogada me dijo que la manda la semana que viene.' },
    ],
    ultimoMensajeSinLeer: true,
  },
  {
    // A cargo del administrador (reasignado desde el gestor): su chat es con el super administrador
    numero: '2026-03310',
    poliza: '04-AU-118274',
    inicioVigencia: '10/10/2025',
    sucursal: 'La Plata',
    aseguradora: 'Federación Patronal',
    ajustador: 'Paula Ríos',
    usuario: 'admin@cova.test',
    reasignadoDe: 'gestor@cova.test',
    estado: 'En negociación',
    asignadoHaceDias: 40,
    ultimoMovimientoHaceDias: 2,
    ocurrioHaceDias: 45,
    hora: '13:05',
    causa: 'Atropello de un peatón menor de edad que cruzaba fuera de la senda peatonal.',
    menorEdadInvolucrado: true,
    lugar: {
      provincia: 'Ciudad Autónoma de Buenos Aires',
      localidad: 'Palermo',
      calle: 'Av. Santa Fe 3500',
      codigoPostal: 'C1425',
    },
    vehiculos: [
      {
        rol: RolAccidente.ASEGURADO,
        dominio: 'AB987NP',
        marca: 'Peugeot',
        modelo: '208',
        version: '1.6 Allure',
        anio: 2020,
        color: 'Azul',
        tipo: 'Hatchback 5 puertas',
        uso: UsoVehiculo.PARTICULAR,
        numeroChasis: '8AD2PN6AXLG667788',
        numeroMotor: '10FX5S667788',
        descripcionDanos: 'Sin daños de importancia: marca en el paragolpes delantero.',
        aseguradora: 'Federación Patronal',
        personas: [
          {
            nombre: 'Carolina Ibáñez',
            documento: '27333444',
            tipoDocumento: DNI,
            sexo: 'Femenino',
            estadoCivil: 'Casada',
            fechaNacimiento: '1979-04-17',
            telefono: '11 5555-4001',
            email: 'cibanez@correo.test',
            carnet: { numero: '27333444', vence: '2027-04-17' },
            esPropietario: true,
            iba: true,
            rolEnVehiculo: 'Conductora',
            direccion: {
              provincia: 'Ciudad Autónoma de Buenos Aires',
              localidad: 'Belgrano',
              calle: 'Cabildo 2100',
              pisoDepartamento: '8° D',
              codigoPostal: 'C1428',
            },
          },
        ],
      },
    ],
    personasSinVehiculo: [
      {
        nombre: 'Tomás Benítez',
        documento: '52444555',
        tipoDocumento: DNI,
        sexo: 'Masculino',
        fechaNacimiento: '2011-08-09',
        rolSinVehiculo: 'Peatón',
        lesion: {
          tipo: TipoLesion.MODERADA,
          descripcion: 'Fractura de tibia derecha. Cirugía programada.',
        },
        abogado: 'Valeria Quintana',
      },
      {
        nombre: 'Silvia Benítez',
        documento: '30555666',
        tipoDocumento: 'Pasaporte argentino',
        sexo: 'Femenino',
        estadoCivil: 'Casada',
        fechaNacimiento: '1983-01-25',
        telefono: '11 5555-4002',
        rolSinVehiculo: 'Madre y representante del menor',
        abogado: 'Valeria Quintana',
        direccion: {
          provincia: 'Ciudad Autónoma de Buenos Aires',
          localidad: 'Palermo',
          calle: 'Charcas 4100',
          codigoPostal: 'C1425',
        },
      },
    ],
    peritos: [
      {
        tipo: TipoPerito.MEDICO,
        nombre: 'Dr. Esteban Roldán',
        telefono: '11 5555-4101',
        email: 'eroldan@medicos.test',
        solicitadoHaceDias: 30,
        cerradoHaceDias: 12,
      },
    ],
    novedades: [
      'La pericia médica estima 90 días de incapacidad transitoria.',
      'La Dra. Quintana presentó una propuesta. Se elevó a la aseguradora para su análisis.',
    ],
    documentos: [
      { nombre: 'Informe pericia médica.pdf', por: 'asignado', kb: 640 },
      { nombre: 'Propuesta abogada del tercero.pdf', por: 'asignado', kb: 210 },
    ],
    chat: [
      { de: 'supervisor', texto: '¿Cómo viene la negociación con la Dra. Quintana?' },
      {
        de: 'asignado',
        texto: 'Bien encaminada. Espero la respuesta de la aseguradora esta semana.',
      },
    ],
  },
  {
    numero: '2026-02988',
    poliza: '01-AU-442190',
    inicioVigencia: '05/08/2025',
    sucursal: 'Rosario Norte',
    aseguradora: 'Litoral Seguros',
    ajustador: 'Carla Méndez',
    usuario: 'gestor@cova.test',
    estado: 'Solicitud de cierre',
    asignadoHaceDias: 60,
    ultimoMovimientoHaceDias: 0,
    ocurrioHaceDias: 66,
    hora: '07:50',
    causa: 'Colisión lateral en rotonda con un vehículo de transporte de pasajeros.',
    menorEdadInvolucrado: false,
    lugar: {
      provincia: 'Buenos Aires',
      localidad: 'San Nicolás de los Arroyos',
      calle: 'Ruta Nacional 9, km 231',
      codigoPostal: '2900',
    },
    vehiculos: [
      {
        rol: RolAccidente.ASEGURADO,
        dominio: 'AE246QR',
        marca: 'Ford',
        modelo: 'Ranger',
        version: '3.2 XLT 4x4',
        anio: 2021,
        color: 'Gris oscuro',
        tipo: 'Pick-up doble cabina',
        uso: UsoVehiculo.COMERCIAL,
        numeroChasis: '8AFAR23L4MJ135790',
        numeroMotor: 'SA2Q135790',
        descripcionDanos: 'Guardabarros trasero derecho y caja de carga abollados.',
        aseguradora: 'Litoral Seguros',
        personas: [
          {
            nombre: 'Agroservicios Ficticios S.A.',
            documento: '30-70987654-3',
            tipoDocumento: 'Otro',
            sexo: 'Masculino',
            fechaNacimiento: '2005-01-01',
            telefono: '336 555-5001',
            esPropietario: true,
            iba: false,
          },
          {
            nombre: 'Sergio Paredes',
            documento: '26888999',
            tipoDocumento: DNI,
            sexo: 'Masculino',
            fechaNacimiento: '1978-10-03',
            carnet: { numero: '26888999', vence: '2028-10-03' },
            relacionPropietario: 'Empleado',
            rolEnVehiculo: 'Conductor',
          },
        ],
      },
      {
        rol: RolAccidente.TERCERO,
        dominio: 'AD135ST',
        marca: 'Toyota',
        modelo: 'Etios',
        version: '1.5 XS',
        anio: 2019,
        color: 'Negro y amarillo',
        tipo: 'Sedán 4 puertas (taxi)',
        uso: UsoVehiculo.TRANSPORTE_PASAJEROS,
        numeroChasis: '9BRK29BT0K0246810',
        numeroMotor: '2NRF246810',
        descripcionDanos: 'Puerta delantera izquierda y parante B deformados.',
        aseguradora: 'Federación Patronal',
        personas: [
          {
            nombre: 'Ramón Ferreyra',
            documento: '23111000',
            tipoDocumento: DNI,
            sexo: 'Masculino',
            estadoCivil: 'Casado',
            fechaNacimiento: '1972-02-28',
            telefono: '336 555-5002',
            carnet: { numero: '23111000', vence: '2027-02-28' },
            esPropietario: true,
            iba: true,
            rolEnVehiculo: 'Conductor',
            direccion: {
              provincia: 'Buenos Aires',
              localidad: 'San Nicolás de los Arroyos',
              calle: 'Nación 330',
              codigoPostal: '2900',
            },
          },
        ],
      },
    ],
    peritos: [
      {
        tipo: TipoPerito.CESVI,
        nombre: 'Ing. Natalia Vera',
        telefono: '341 555-5101',
        email: 'nvera@cesvi.test',
        solicitadoHaceDias: 50,
        cerradoHaceDias: 35,
      },
    ],
    novedades: [
      'Acuerdo cerrado con el tercero. Se recibió la documentación firmada para el cierre.',
    ],
    documentos: [
      { nombre: 'Informe CESVI.pdf', por: 'asignado', kb: 1500 },
      { nombre: 'Convenio firmado.pdf', por: 'asignado', kb: 780 },
    ],
  },
  {
    numero: '2026-01544',
    poliza: '02-AU-090311',
    inicioVigencia: '01/06/2025',
    sucursal: 'Santa Fe',
    aseguradora: 'Sancor Seguros',
    ajustador: 'Andrea Paz',
    usuario: 'superadmin@cova.test',
    estado: 'Cierre enviado',
    asignadoHaceDias: 90,
    ultimoMovimientoHaceDias: 20,
    cerradoHaceDias: 20,
    ocurrioHaceDias: 95,
    hora: '17:20',
    causa: 'Daños por apertura de puerta: el tercero abrió la puerta sin mirar.',
    menorEdadInvolucrado: false,
    lugar: {
      provincia: 'Santa Fe',
      localidad: 'Santa Fe',
      calle: 'Bv. Gálvez 1600',
      codigoPostal: '3000',
    },
    vehiculos: [
      {
        rol: RolAccidente.ASEGURADO,
        dominio: 'AC864UV',
        marca: 'Volkswagen',
        modelo: 'Polo',
        version: '1.6 MSI Comfortline',
        anio: 2019,
        color: 'Gris',
        tipo: 'Hatchback 5 puertas',
        uso: UsoVehiculo.PARTICULAR,
        numeroChasis: '9BWAL5BZ0KP975310',
        numeroMotor: 'CWS975310',
        descripcionDanos: 'Puerta delantera derecha rayada y abollada.',
        aseguradora: 'Sancor Seguros',
        personas: [
          {
            nombre: 'Mariana Ponce',
            documento: '34000111',
            tipoDocumento: DNI,
            sexo: 'Femenino',
            estadoCivil: 'Soltera',
            fechaNacimiento: '1989-11-11',
            telefono: '342 555-6001',
            carnet: { numero: '34000111', vence: '2029-11-11' },
            esPropietario: true,
            iba: true,
            rolEnVehiculo: 'Conductora',
            direccion: {
              provincia: 'Santa Fe',
              localidad: 'Santa Fe',
              calle: '25 de Mayo 2700',
              codigoPostal: '3000',
            },
          },
        ],
      },
      {
        rol: RolAccidente.TERCERO,
        dominio: 'AA975WX',
        marca: 'Citroën',
        modelo: 'C3',
        version: '1.5 Origine',
        anio: 2015,
        color: 'Bordó',
        tipo: 'Hatchback 5 puertas',
        uso: UsoVehiculo.PARTICULAR,
        numeroChasis: '935SL9HP0FB112358',
        numeroMotor: 'TU3A112358',
        descripcionDanos: 'Bisagra de puerta trasera izquierda dañada.',
        personas: [
          {
            nombre: 'Oscar Benítez',
            documento: '20999000',
            tipoDocumento: DNI,
            sexo: 'Masculino',
            fechaNacimiento: '1968-07-07',
            esPropietario: true,
            iba: true,
            rolEnVehiculo: 'Conductor',
          },
        ],
      },
    ],
    novedades: ['Se envió el informe final y el cierre a Sancor Seguros.'],
    documentos: [{ nombre: 'Informe final.pdf', por: 'asignado', kb: 890 }],
  },
]

// ------------------------------------------------------------------------------------- Lógica

const DIA_MS = 86_400_000
const ahora = new Date()

/**
 * Instante de hace N días a la hora indicada (para columnas Timestamptz).
 * Nunca devuelve una fecha futura: si "hoy a esa hora" todavía no llegó, usa unos minutos atrás.
 */
function haceDias(dias: number, hora = 10, minutos = 0): Date {
  const d = new Date(ahora.getTime() - dias * DIA_MS)
  d.setHours(hora, minutos, 0, 0)
  const tope = ahora.getTime() - 10 * 60_000
  return d.getTime() > tope ? new Date(tope) : d
}

/** Fecha sin hora (columnas @db.Date). */
function fecha(isoOAdias: string | number): Date {
  if (typeof isoOAdias === 'string') return new Date(`${isoOAdias}T00:00:00Z`)
  const d = new Date(ahora.getTime() - isoOAdias * DIA_MS)
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

/** Hora sin fecha (columnas @db.Time). */
function hora(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00Z`)
}

/** Reparte N eventos entre dos días (de más viejo a más nuevo), terminando en el más reciente. */
function repartir(n: number, desdeDias: number, hastaDias: number): number[] {
  if (n === 1) return [hastaDias]
  const paso = (desdeDias - hastaDias) / (n - 1)
  return Array.from({ length: n }, (_, i) => Math.round(desdeDias - paso * i))
}

function obtener<T>(mapa: Map<string, T>, clave: string, que: string): T {
  const valor = mapa.get(clave)
  if (valor === undefined) throw new Error(`Seed de desarrollo: no existe ${que} "${clave}"`)
  return valor
}

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

function archivo(nombre: string, carpeta: string) {
  const ext = nombre.split('.').pop() ?? ''
  const clave = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
  return {
    nombreOriginal: nombre,
    tipoExtension: ext,
    mimeType: MIME[ext] ?? 'application/octet-stream',
    // Ruta dentro del bucket de R2. Los archivos NO existen: descargarlos va a fallar.
    urlArchivoSinDominio: `${carpeta}/${clave}`,
  }
}

export interface ResumenSeedDesarrollo {
  usuarios: number
  aseguradoras: number
  ajustadores: number
  abogados: number
  siniestros: number
}

/**
 * Carga los datos ficticios. Requiere que la seed base ya esté aplicada (provincias, estados y
 * tipos de documento). `hashes` son los hashes Argon2 de USUARIOS_DEV, por email.
 */
export async function seedDesarrollo(
  tx: Tx,
  hashes: Map<string, string>,
): Promise<ResumenSeedDesarrollo> {
  const provincias = new Map(
    (await tx.provincia.findMany({ select: { id: true, nombre: true } })).map((p) => [
      p.nombre,
      p.id,
    ]),
  )
  const estados = new Map(
    (await tx.estadoSiniestro.findMany({ select: { id: true, nombre: true } })).map((e) => [
      e.nombre,
      e.id,
    ]),
  )
  const tiposDocumento = new Map(
    (await tx.tipoDocumento.findMany({ select: { id: true, nombre: true } })).map((t) => [
      t.nombre,
      t.id,
    ]),
  )

  const crearDireccion = async (d: DireccionDev) =>
    (
      await tx.direccion.create({
        data: {
          localidad: d.localidad,
          calle: d.calle,
          pisoDepartamento: d.pisoDepartamento,
          codigoPostal: d.codigoPostal,
          idProvincia: obtener(provincias, d.provincia, 'la provincia'),
        },
      })
    ).id

  // Usuarios
  const usuarios = new Map<string, { id: number; nombres: string; apellidos: string }>()
  for (const u of USUARIOS_DEV) {
    const creado = await tx.usuario.create({
      data: {
        nombres: u.nombres,
        apellidos: u.apellidos,
        documento: u.documento,
        telefono: u.telefono,
        email: u.email,
        contrasena: obtener(hashes, u.email, 'el hash del usuario'),
        tipoUsuario: u.tipoUsuario,
        idDireccion: await crearDireccion(u.direccion),
        ultimaConexion: haceDias(0, 9),
      },
    })
    usuarios.set(u.email, creado)
  }

  // Aseguradoras y ajustadores
  const aseguradoras = new Map<string, number>()
  const ajustadores = new Map<string, number>()
  for (const a of ASEGURADORAS) {
    const baja = 'baja' in a && a.baja
    const aseguradora = await tx.aseguradora.create({
      data: { nombre: a.nombre, eliminado: baja, fechaBaja: baja ? haceDias(60) : null },
    })
    aseguradoras.set(a.nombre, aseguradora.id)
    for (const aj of a.ajustadores) {
      const bajaAj = 'baja' in aj && aj.baja
      const usuarioMail = `${aj.nombres}.${aj.apellidos}`
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
      const ajustador = await tx.ajustador.create({
        data: {
          nombres: aj.nombres,
          apellidos: aj.apellidos,
          telefono: aj.telefono,
          email: `${usuarioMail}@ajustadores.test`,
          idAseguradora: aseguradora.id,
          eliminado: bajaAj,
          fechaBaja: bajaAj ? haceDias(30) : null,
        },
      })
      ajustadores.set(`${aj.nombres} ${aj.apellidos}`, ajustador.id)
    }
  }

  // Abogados
  const abogados = new Map<string, number>()
  for (const ab of ABOGADOS) {
    abogados.set(ab.nombreCompleto, (await tx.abogado.create({ data: { ...ab } })).id)
  }

  // Las plantillas se crean únicamente al cargar archivos reales desde la aplicación.

  // Siniestros con todo su expediente
  for (const s of SINIESTROS) {
    const asignado = obtener(usuarios, s.usuario, 'el usuario')
    const supervisor = obtener(
      usuarios,
      s.usuario === 'admin@cova.test' ? 'superadmin@cova.test' : 'admin@cova.test',
      'el usuario',
    )
    const idAsignado = asignado.id
    const idSupervisor = supervisor.id
    const quien = (p: Participante) => (p === 'asignado' ? asignado : supervisor)
    const cerrado = s.estado === 'Cierre enviado'
    const fechaAsignacion = haceDias(s.asignadoHaceDias, 9)

    const siniestro = await tx.siniestro.create({
      data: {
        numeroSiniestro: s.numero,
        numeroPoliza: s.poliza,
        inicioVigencia: s.inicioVigencia,
        sucursal: s.sucursal,
        causa: s.causa,
        menorEdadInvolucrado: s.menorEdadInvolucrado,
        fechaOcurrencia: fecha(s.ocurrioHaceDias),
        horaOcurrencia: hora(s.hora),
        fechaAsignacion,
        fechaUltimoMovimiento: haceDias(s.ultimoMovimientoHaceDias, 16),
        fechaCierre: s.cerradoHaceDias !== undefined ? haceDias(s.cerradoHaceDias, 12) : null,
        // RF-19: sin cambios en más de 72 h (los cerrados no cuentan)
        demorado: !cerrado && s.ultimoMovimientoHaceDias >= 3,
        idEstadoSiniestro: obtener(estados, s.estado, 'el estado'),
        idAseguradora: obtener(aseguradoras, s.aseguradora, 'la aseguradora'),
        idAjustador: obtener(ajustadores, s.ajustador, 'el ajustador'),
        idUsuario: idAsignado,
        idDireccion: await crearDireccion(s.lugar),
      },
    })
    const idSiniestro = siniestro.id

    const crearPersona = async (p: PersonaDev, idVehiculo: number | null) => {
      await tx.personaInvolucrada.create({
        data: {
          idSiniestro,
          idVehiculo,
          nombreCompletoRazonSocial: p.nombre,
          documento: p.documento,
          idTipoDocumento: obtener(tiposDocumento, p.tipoDocumento, 'el tipo de documento'),
          sexo: p.sexo,
          estadoCivil: p.estadoCivil,
          fechaNacimiento: fecha(p.fechaNacimiento),
          telefono: p.telefono,
          email: p.email,
          numeroPermisoConducir: p.carnet?.numero,
          fechaVencimientoCarnet: p.carnet ? fecha(p.carnet.vence) : undefined,
          esPropietario: idVehiculo ? (p.esPropietario ?? false) : undefined,
          esOcupante: idVehiculo ? (p.esPropietario ? (p.iba ?? false) : true) : undefined,
          relacionPropietario: p.relacionPropietario,
          rolEnVehiculo: p.rolEnVehiculo,
          rolSinVehiculo: p.rolSinVehiculo,
          tipoLesion: p.lesion?.tipo,
          descripcionLesiones: p.lesion?.descripcion,
          idAbogado: p.abogado ? obtener(abogados, p.abogado, 'el abogado') : undefined,
          idDireccion: p.direccion ? await crearDireccion(p.direccion) : undefined,
        },
      })
    }

    for (const v of s.vehiculos) {
      const { personas, aseguradora, rol, ...datos } = v
      const vehiculo = await tx.vehiculo.create({
        data: {
          ...datos,
          rolAccidente: rol,
          idAseguradora: aseguradora ? obtener(aseguradoras, aseguradora, 'la aseguradora') : null,
        },
      })
      for (const p of personas) await crearPersona(p, vehiculo.id)
    }
    for (const p of s.personasSinVehiculo ?? []) await crearPersona(p, null)

    for (const pe of s.peritos ?? []) {
      await tx.perito.create({
        data: {
          idSiniestro,
          tipoPerito: pe.tipo,
          nombre: pe.nombre,
          telefono: pe.telefono,
          email: pe.email,
          fechaSolicitud: haceDias(pe.solicitadoHaceDias),
          cerrado: pe.cerradoHaceDias !== undefined,
          fechaCierre: pe.cerradoHaceDias !== undefined ? haceDias(pe.cerradoHaceDias) : null,
        },
      })
    }

    // Movimientos del expediente, con su historial y sus notificaciones. Las novedades, documentos
    // y mensajes se reparten entre la asignación y el último movimiento.
    const notificar = (
      idUsuario: number,
      tipoNotificacion: TipoNotificacion,
      mensaje: string,
      fechaCreacion: Date,
      // Las de más de un día quedan leídas; las recientes, pendientes
      leida = ahora.getTime() - fechaCreacion.getTime() > DIA_MS,
    ) =>
      tx.notificacion.create({
        data: {
          idUsuario,
          idSiniestro,
          tipoNotificacion,
          mensaje,
          leida,
          revisada: leida,
          fechaCreacion,
        },
      })
    const historial = (idUsuario: number, evento: EventoHistorial, fechaEvento: Date) =>
      tx.historialSiniestro.create({ data: { idSiniestro, idUsuario, ...evento, fechaEvento } })

    const desde = s.asignadoHaceDias
    const hasta = s.ultimoMovimientoHaceDias

    // Asignación (RF-10) y reasignación (RF-12): las hace el supervisor
    if (s.reasignadoDe) {
      const anterior = obtener(usuarios, s.reasignadoDe, 'el usuario')
      const fechaOriginal = haceDias(s.asignadoHaceDias + 7, 9)
      await historial(
        idSupervisor,
        eventoHistorial.asignacion(anterior, fechaOriginal),
        fechaOriginal,
      )
      await notificar(
        anterior.id,
        TipoNotificacion.ASIGNACION_SINIESTRO,
        `Se te asignó el siniestro ${s.numero}`,
        fechaOriginal,
      )
      await historial(
        idSupervisor,
        eventoHistorial.reasignacion(anterior, asignado, fechaAsignacion),
        fechaAsignacion,
      )
      await notificar(
        idAsignado,
        TipoNotificacion.REASIGNACION_SINIESTRO,
        `Se te reasignó el siniestro ${s.numero} (antes a cargo de ${nombreCompleto(anterior)})`,
        fechaAsignacion,
      )
    } else {
      await historial(
        idSupervisor,
        eventoHistorial.asignacion(asignado, fechaAsignacion),
        fechaAsignacion,
      )
      await notificar(
        idAsignado,
        TipoNotificacion.ASIGNACION_SINIESTRO,
        `Se te asignó el siniestro ${s.numero}`,
        fechaAsignacion,
      )
    }

    // Novedades: el autor es el usuario asignado al siniestro
    const diasNovedades = repartir(s.novedades.length, desde, hasta)
    for (const [i, descripcion] of s.novedades.entries()) {
      const fechaCarga = haceDias(diasNovedades[i] ?? hasta, 11)
      await tx.novedadSiniestro.create({
        data: { idSiniestro, descripcion, autor: nombreCompleto(asignado), fechaCarga },
      })
      await historial(idAsignado, eventoHistorial.novedad(asignado, fechaCarga), fechaCarga)
      await notificar(
        idSupervisor,
        TipoNotificacion.NOVEDAD_CARGADA,
        `Nueva novedad en el siniestro ${s.numero}`,
        fechaCarga,
      )
    }

    const diasDocumentos = repartir(s.documentos.length, desde, hasta)
    for (const [i, d] of s.documentos.entries()) {
      const fechaCarga = haceDias(diasDocumentos[i] ?? hasta, 12)
      const autor = quien(d.por)
      const destinatario = d.por === 'asignado' ? idSupervisor : idAsignado
      await tx.documentoSiniestro.create({
        data: {
          ...archivo(d.nombre, `siniestros/${s.numero}`),
          tamanoBytes: BigInt(d.kb * 1024),
          fechaCarga,
          idUsuario: autor.id,
          idSiniestro,
        },
      })
      await historial(
        autor.id,
        eventoHistorial.documentoSubido(autor, d.nombre, fechaCarga),
        fechaCarga,
      )
      await notificar(
        destinatario,
        TipoNotificacion.DOCUMENTO_NUEVO,
        `Nuevo documento en el siniestro ${s.numero}: ${d.nombre}`,
        fechaCarga,
      )
    }

    const chat = s.chat ?? []
    for (const [i, m] of chat.entries()) {
      const autor = quien(m.de)
      const lector = m.de === 'asignado' ? idSupervisor : idAsignado
      const enviado = haceDias(hasta, 9, 10 + i * 5)
      const ultimo = i === chat.length - 1
      const mensaje = await tx.mensajeChat.create({
        data: { idSiniestro, idUsuario: autor.id, contenidoMensaje: m.texto, fechaEnvio: enviado },
      })
      await historial(autor.id, eventoHistorial.mensaje(autor, enviado), enviado)
      if (ultimo && s.ultimoMensajeSinLeer) {
        // RF 1.h.1.1: una sola notificación de mensajes nuevos por siniestro
        await notificar(
          lector,
          TipoNotificacion.MENSAJE_NUEVO,
          `Tenés mensajes nuevos en el siniestro ${s.numero}`,
          enviado,
          false,
        )
      } else {
        await tx.lecturaMensajeChat.create({
          data: {
            idMensajeChat: mensaje.id,
            idUsuario: lector,
            fechaLeido: new Date(Math.min(enviado.getTime() + 15 * 60_000, ahora.getTime())),
          },
        })
      }
    }

    // Cambio de estado desde el inicial (RF-20). El cierre lo confirma el supervisor (RF-18);
    // los demás los hace el usuario asignado. Se notifica a la otra parte.
    if (s.estado !== 'En tratamiento') {
      const fechaCambio = haceDias(hasta, 15)
      const autor = cerrado ? supervisor : asignado
      await historial(
        autor.id,
        eventoHistorial.cambioEstado('En tratamiento', s.estado, fechaCambio),
        fechaCambio,
      )
      await notificar(
        autor.id === idAsignado ? idSupervisor : idAsignado,
        TipoNotificacion.CAMBIO_ESTADO,
        `El siniestro ${s.numero} pasó a "${s.estado}"`,
        fechaCambio,
      )
    }
  }
  return {
    usuarios: USUARIOS_DEV.length,
    aseguradoras: ASEGURADORAS.length,
    ajustadores: ajustadores.size,
    abogados: ABOGADOS.length,
    siniestros: SINIESTROS.length,
  }
}
