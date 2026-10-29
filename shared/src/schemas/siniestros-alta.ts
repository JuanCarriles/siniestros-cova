import { z } from 'zod'
import {
  booleanoSchema,
  claveArchivoSchema,
  emailSchema,
  enteroPequenoSchema,
  fechaSchema,
  horaSchema,
  idSchema,
  opcional,
} from './comunes.ts'
import {
  rolAccidenteSchema,
  tipoLesionSchema,
  tipoPeritoSchema,
  usoVehiculoSchema,
  type RolAccidente,
  type TipoLesion,
  type TipoPerito,
  type TipoUsuario,
} from './enums.ts'

// ------------------------------------------------------------------ Alta de siniestro (CU-09 pasos 4-5, E4-04)

/** Pasos del alta, en el orden del CU-09. Cada historia habilita el suyo. */
export const PASOS_ALTA = [
  'Datos del caso',
  'Vehículos y personas',
  'Abogados',
  'Peritos',
  'Documentos y asignación',
] as const

/** Hoy en Argentina, como AAAA-MM-DD: el navegador y el servidor comparan contra el mismo día. */
export function hoyArgentina(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    ahora,
  )
}

const obligatorio = (mensaje: string, max: number) =>
  z.string({ error: mensaje }).trim().min(1, mensaje).max(max, `Usá como máximo ${max} caracteres`)
const libre = (max: number) =>
  opcional(z.string().trim().min(1).max(max, `Usá como máximo ${max} caracteres`))
// Las listas desplegables mandan '' cuando no se eligió nada: ese caso tiene su propio mensaje.
const elegido = (mensaje: string) =>
  z.union([z.number(), z.string().trim().min(1, mensaje)], { error: mensaje }).pipe(idSchema)

// Paso 1: datos del caso. Solo número, póliza, aseguradora y sucursal son obligatorios (CU-09 5.a); el resto se
// carga si se conoce. El país solo filtra provincias en el formulario: la dirección guarda la provincia.
export const datosCasoSchema = z
  .strictObject({
    numeroSiniestro: obligatorio('Ingresá el número de siniestro', 60),
    numeroPoliza: obligatorio('Ingresá el número de póliza', 60),
    inicioVigencia: libre(60),
    idAseguradora: elegido('Elegí la aseguradora'),
    sucursal: obligatorio('Ingresá la sucursal de emisión', 100),
    idAjustador: opcional(idSchema),
    fechaOcurrencia: opcional(
      fechaSchema.refine(
        (fecha) => fecha <= hoyArgentina(),
        'La fecha no puede ser posterior a hoy',
      ),
    ),
    horaOcurrencia: opcional(horaSchema),
    menorEdadInvolucrado: booleanoSchema,
    causa: libre(2000),
    lugar: z.strictObject({
      idProvincia: opcional(idSchema),
      localidad: libre(100),
      calle: libre(150),
      codigoPostal: libre(20),
    }),
  })
  .refine((datos) => !datos.horaOcurrencia || datos.fechaOcurrencia, {
    message: 'Cargá también la fecha de ocurrencia',
    path: ['fechaOcurrencia'],
  })

export type DatosCasoInput = z.input<typeof datosCasoSchema>
export type DatosCasoData = z.output<typeof datosCasoSchema>

/** Lo que necesita el formulario del paso 1: solo aseguradoras, ajustadores y provincias activos. */
export type OpcionesAltaSiniestro = {
  aseguradoras: { id: number; nombre: string }[]
  ajustadores: { id: number; nombre: string; idAseguradora: number; casosActivos: number }[]
  paises: { id: number; nombre: string }[]
  provincias: { id: number; nombre: string; idPais: number }[]
  tiposDocumento: { id: number; nombre: string }[]
  /** Paso 5: a quién se puede asignar el siniestro (gestores, administradores y superadministradores) */
  usuarios: { id: number; nombre: string; tipoUsuario: TipoUsuario; casosActivos: number }[]
}

// ------------------------------------------------------------------ Paso 2: vehículos (CU-09 pasos 6-10, E4-05)

export const ANIO_VEHICULO_MINIMO = 1900

/** Para comparar dominios: "ae 123-cd" y "AE123CD" son el mismo vehículo (CU-09 9.a). */
export function normalizarDominio(dominio: string): string {
  return dominio.replace(/[\s-]/g, '').toUpperCase()
}

export const ROLES_ACCIDENTE: Record<RolAccidente, string> = {
  ASEGURADO: 'Asegurado',
  TERCERO: 'Tercero',
}

export const USOS_VEHICULO = {
  PARTICULAR: 'Particular',
  COMERCIAL: 'Uso comercial',
  TRANSPORTE_PASAJEROS: 'Transporte de pasajeros',
} as const

// Solo el dominio y el rol son obligatorios: sin rol, el listado no sabe cuál es el vehículo asegurado. Sin
// aseguradora significa "sin seguro o no se sabe". Que el dominio no se repita en el siniestro se controla contra
// los demás vehículos del alta.
export const vehiculoAltaSchema = z.strictObject({
  rolAccidente: z
    // '' (o null, si no se marcó ningún botón) tiene el mismo mensaje que un valor inválido
    .enum(['', ...rolAccidenteSchema.options], {
      error: 'Elegí si el vehículo es del asegurado o de un tercero',
    })
    .refine((rol) => rol !== '', 'Elegí si el vehículo es del asegurado o de un tercero'),
  marca: libre(60),
  modelo: libre(60),
  version: libre(100),
  // Sin letras ni números ("---") no identifica a ningún vehículo: normalizado quedaría vacío
  dominio: obligatorio('Ingresá el dominio', 15)
    .refine((dominio) => !dominio || /[a-z0-9]/i.test(dominio), 'Ingresá un dominio válido')
    .transform((dominio) => dominio.toUpperCase()),
  numeroChasis: libre(40).transform((valor) => valor?.toUpperCase() ?? valor),
  numeroMotor: libre(40).transform((valor) => valor?.toUpperCase() ?? valor),
  anio: opcional(
    enteroPequenoSchema.pipe(
      z
        .number()
        .min(ANIO_VEHICULO_MINIMO, `Ingresá un año desde ${ANIO_VEHICULO_MINIMO}`)
        .refine(
          (anio) => anio <= new Date().getFullYear() + 1,
          'El año no puede ser posterior al año que viene',
        ),
    ),
  ),
  uso: opcional(usoVehiculoSchema),
  tipo: libre(60),
  color: libre(40),
  idAseguradora: opcional(idSchema),
  acreedorPrendario: libre(100),
  descripcionDanos: libre(2000),
})

export type VehiculoAltaInput = z.input<typeof vehiculoAltaSchema>
export type VehiculoAltaData = z.output<typeof vehiculoAltaSchema>

// ------------------------------------------------------------------ Paso 2: titular y ocupantes (CU-09 11-18, E4-06)

export const ESTADOS_CIVILES = [
  'Soltero/a',
  'Casado/a',
  'Divorciado/a',
  'Viudo/a',
  'Unión convivencial',
] as const
export const SEXOS = ['Femenino', 'Masculino', 'X'] as const
export const CONDUCTOR = 'Conductor/a'
/** Dónde iba la persona. "Otro" pide escribirlo ("en la caja de carga"). */
export const LUGARES_EN_VEHICULO = [CONDUCTOR, 'Acompañante', 'Pasajero/a', 'Otro'] as const
export const GRAVEDADES_LESION: Record<TipoLesion, string> = {
  LEVE: 'Leve',
  MODERADA: 'Moderada',
  GRAVE: 'Grave',
  MUERTE: 'Muerte',
}

/** Para comparar documentos: "25.884.301" y "25884301" son la misma persona. */
export function normalizarDocumento(documento: string): string {
  return documento.replace(/[^0-9a-z]/gi, '').toUpperCase()
}

// Vacío es "sin email"; cualquier otra cosa tiene que ser un email (si no, el mensaje genérico sería en inglés)
const emailOpcional = z
  .union([z.literal(''), emailSchema.pipe(z.string().max(120))], {
    error: 'Ingresá un email válido',
  })
  .transform((email) => email || null)
  .nullable()
  .optional()

// Todo es opcional: se carga lo que se sepa. Una persona sin nombre se muestra como "Desconocido 1, 2…".
const datosPersona = {
  nombreCompletoRazonSocial: libre(150),
  idTipoDocumento: opcional(idSchema),
  documento: libre(30),
  estadoCivil: opcional(z.enum(ESTADOS_CIVILES)),
  sexo: opcional(z.enum(SEXOS)),
  fechaNacimiento: opcional(
    fechaSchema.refine((fecha) => fecha <= hoyArgentina(), 'La fecha no puede ser posterior a hoy'),
  ),
  telefono: libre(50),
  email: emailOpcional,
  domicilio: z.strictObject({
    idProvincia: opcional(idSchema),
    localidad: libre(100),
    calle: libre(150),
    codigoPostal: libre(20),
  }),
  // Detrás de un control: sin lesiones no se pide nada más; con lesiones, la gravedad
  conLesiones: booleanoSchema,
  tipoLesion: opcional(tipoLesionSchema),
  descripcionLesiones: libre(2000),
}
// Solo para quien iba en un vehículo
const permisoConducir = {
  numeroPermisoConducir: libre(30),
  fechaVencimientoCarnet: opcional(fechaSchema),
}
const lugarEnVehiculo = {
  lugar: opcional(z.enum(LUGARES_EN_VEHICULO)),
  lugarOtro: libre(60),
}

type Reglas = {
  conLesiones: boolean
  tipoLesion?: TipoLesion | null
  numeroPermisoConducir?: string | null
  fechaVencimientoCarnet?: string | null
  lugar?: string | null
  lugarOtro?: string | null
}
function reglasPersona(datos: Reglas, ctx: z.RefinementCtx) {
  if (datos.conLesiones && !datos.tipoLesion)
    ctx.addIssue({
      code: 'custom',
      path: ['tipoLesion'],
      message: 'Elegí la gravedad de las lesiones',
    })
  if (datos.fechaVencimientoCarnet && !datos.numeroPermisoConducir)
    ctx.addIssue({
      code: 'custom',
      path: ['numeroPermisoConducir'],
      message: 'Cargá también el número de permiso',
    })
  if (datos.lugar === 'Otro' && !datos.lugarOtro)
    ctx.addIssue({ code: 'custom', path: ['lugarOtro'], message: 'Indicá dónde iba' })
}
// Lo que dejó de corresponder no se guarda: sin lesiones no hay gravedad ni descripción
function limpiarLesiones<T extends Reglas & { descripcionLesiones?: string | null }>(datos: T): T {
  return {
    ...datos,
    tipoLesion: datos.conLesiones ? datos.tipoLesion : null,
    descripcionLesiones: datos.conLesiones ? datos.descripcionLesiones : null,
  }
}
function limpiarPersona<T extends Reglas & { descripcionLesiones?: string | null }>(datos: T): T {
  return limpiarLesiones({ ...datos, lugarOtro: datos.lugar === 'Otro' ? datos.lugarOtro : null })
}

// Titular del vehículo: primero, si iba en él y dónde
export const titularAltaSchema = z
  .strictObject({
    ibaEnVehiculo: booleanoSchema,
    ...lugarEnVehiculo,
    ...datosPersona,
    ...permisoConducir,
  })
  .superRefine((datos, ctx) =>
    reglasPersona(datos.ibaEnVehiculo ? datos : { ...datos, lugar: null }, ctx),
  )
  .transform((datos) =>
    limpiarPersona(datos.ibaEnVehiculo ? datos : { ...datos, lugar: null, lugarOtro: null }),
  )

// Ocupante: dónde iba y, si manejaba él (no el titular), qué relación tiene con el titular
export const ocupanteAltaSchema = z
  .strictObject({
    ...lugarEnVehiculo,
    relacionPropietario: libre(150),
    ...datosPersona,
    ...permisoConducir,
  })
  .superRefine(reglasPersona)
  .transform((datos) =>
    limpiarPersona({
      ...datos,
      relacionPropietario: datos.lugar === CONDUCTOR ? datos.relacionPropietario : null,
    }),
  )

export type TitularAltaInput = z.input<typeof titularAltaSchema>
export type TitularAltaData = z.output<typeof titularAltaSchema>
export type OcupanteAltaInput = z.input<typeof ocupanteAltaSchema>
export type OcupanteAltaData = z.output<typeof ocupanteAltaSchema>

// ------------------------------------------------------------------ Paso 2: personas fuera de los vehículos (CU-09 19-22, E4-07)

/** Los roles más comunes, como atajo: el rol se escribe libre ("dueño del comercio", "conductor de la moto"…). */
export const ROLES_SIN_VEHICULO = ['Peatón', 'Testigo', 'Dueño/a de propiedad'] as const

// Peatones, testigos, dueños de propiedades dañadas: el rol es lo único obligatorio (explica por qué está en el
// siniestro). Sin permiso de conducir ni lugar en un vehículo.
export const personaExternaAltaSchema = z
  .strictObject({
    rolSinVehiculo: obligatorio('Indicá qué rol tuvo en el siniestro', 100),
    ...datosPersona,
  })
  .superRefine(reglasPersona)
  .transform(limpiarLesiones)

export type PersonaExternaAltaInput = z.input<typeof personaExternaAltaSchema>
export type PersonaExternaAltaData = z.output<typeof personaExternaAltaSchema>

// ------------------------------------------------------------------ Paso 3: abogados (CU-09 pasos 23-27, E4-08)

// Solo el nombre y a quién representa son obligatorios (25.b). Representa a una o varias personas del alta (25.a),
// que todavía no tienen id: se guardan sus claves. Cada persona tiene a lo sumo un abogado.
export const abogadoAltaSchema = z.strictObject({
  nombreCompleto: obligatorio('Ingresá el nombre completo', 150),
  numeroMatricula: libre(40),
  telefono: libre(50),
  email: emailOpcional,
  representados: z
    .array(z.string().min(1))
    .min(1, 'Elegí al menos una persona a la que representa'),
})

export type AbogadoAltaInput = z.input<typeof abogadoAltaSchema>
export type AbogadoAltaData = z.output<typeof abogadoAltaSchema>

// ------------------------------------------------------------------ Paso 4: peritos (CU-09 pasos 28-31, E4-09)

export const TIPOS_PERITO: Record<TipoPerito, string> = {
  CESVI: 'CESVI',
  MEDICO: 'Médico',
}

const fechaHastaHoy = fechaSchema.refine(
  (fecha) => fecha <= hoyArgentina(),
  'La fecha no puede ser posterior a hoy',
)

// Un perito CESVI y uno médico como máximo: el paso 4 tiene un lugar para cada uno. El nombre y la fecha de
// solicitud son obligatorios (así está la base). Sin fecha de cierre la pericia queda pendiente (29.a): cerrado se
// deduce de la fecha, no se carga aparte.
export const peritoAltaSchema = z
  .strictObject({
    tipoPerito: tipoPeritoSchema,
    nombre: obligatorio('Ingresá el nombre del perito', 150),
    telefono: libre(50),
    email: emailOpcional,
    fechaSolicitud: z
      .string({ error: 'Ingresá la fecha de solicitud' })
      .min(1, 'Ingresá la fecha de solicitud')
      .pipe(fechaHastaHoy),
    fechaCierre: opcional(fechaHastaHoy),
  })
  .refine((p) => !p.fechaCierre || p.fechaCierre >= p.fechaSolicitud, {
    message: 'El cierre no puede ser anterior a la solicitud',
    path: ['fechaCierre'],
  })
  .transform((p) => ({ ...p, cerrado: !!p.fechaCierre }))

export type PeritoAltaInput = z.input<typeof peritoAltaSchema>
export type PeritoAltaData = z.output<typeof peritoAltaSchema>

// ------------------------------------------------------------------ Paso 5: documentos, asignación y alta (CU-09 32-36, E4-10)

/**
 * Un documento ya subido a R2 durante el alta, antes de que exista el siniestro (carpeta altas/{idUsuario}). Al
 * crear el siniestro se registra como documento suyo.
 */
export const documentoAltaSchema = z.strictObject({
  clave: claveArchivoSchema,
  nombreOriginal: z.string().trim().min(1).max(255),
  tipoExtension: z.string().min(1).max(10),
  mimeType: z.string().min(1).max(120),
  tamanoBytes: z.number().int().positive(),
})
export type DocumentoAlta = z.infer<typeof documentoAltaSchema>

// Las personas llevan la clave con que las identifica el alta: los abogados las referencian por esa clave
const conClave = <T extends z.ZodType>(datos: T) =>
  z.strictObject({ clave: z.string().min(1).max(64), datos })

export const MENSAJE_ASIGNACION_OBLIGATORIA =
  'La asignación es obligatoria: elegí a quién se le asigna el siniestro'

// Todo lo cargado en los cinco pasos, tal como se manda al confirmar (paso 35). El servidor vuelve a validar cada
// parte con su schema y, acá, lo que cruza pasos.
export const crearSiniestroSchema = z
  .strictObject({
    datosCaso: datosCasoSchema,
    vehiculos: z
      .array(
        z.strictObject({
          datos: vehiculoAltaSchema,
          titular: conClave(titularAltaSchema).nullable(),
          ocupantes: z.array(conClave(ocupanteAltaSchema)).max(60),
        }),
      )
      .max(30),
    personasExternas: z.array(conClave(personaExternaAltaSchema)).max(60),
    abogados: z.array(abogadoAltaSchema).max(30),
    peritos: z.array(peritoAltaSchema).max(2),
    documentos: z.array(documentoAltaSchema).max(60),
    idUsuarioAsignado: elegido(MENSAJE_ASIGNACION_OBLIGATORIA),
  })
  .superRefine((alta, ctx) => {
    const error = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: 'custom', message, path })

    const dominios = new Set<string>()
    alta.vehiculos.forEach((v, i) => {
      const dominio = normalizarDominio(v.datos.dominio)
      if (dominios.has(dominio))
        error(`El vehículo ${v.datos.dominio} está cargado dos veces`, ['vehiculos', i])
      dominios.add(dominio)
    })

    const personas = [
      ...alta.vehiculos.flatMap((v) => [...(v.titular ? [v.titular] : []), ...v.ocupantes]),
      ...alta.personasExternas,
    ]
    const claves = new Set<string>()
    const documentos = new Set<string>()
    for (const p of personas) {
      if (claves.has(p.clave)) error('Hay una persona cargada dos veces', ['personasExternas'])
      claves.add(p.clave)
      const documento = p.datos.documento ? normalizarDocumento(p.datos.documento) : ''
      if (documento && documentos.has(documento))
        error(`El documento ${p.datos.documento} está cargado en dos personas`, [
          'personasExternas',
        ])
      if (documento) documentos.add(documento)
    }

    // Cada persona tiene a lo sumo un abogado, y solo personas de esta alta
    const representadas = new Set<string>()
    alta.abogados.forEach((a, i) => {
      for (const clave of a.representados) {
        if (!claves.has(clave))
          error(`${a.nombreCompleto} representa a una persona que ya no está en el alta`, [
            'abogados',
            i,
          ])
        if (representadas.has(clave)) error('Una persona tiene más de un abogado', ['abogados', i])
        representadas.add(clave)
      }
    })

    const tipos = alta.peritos.map((p) => p.tipoPerito)
    if (new Set(tipos).size !== tipos.length)
      error('Puede haber un perito CESVI y uno médico como máximo', ['peritos'])

    const archivos = alta.documentos.map((d) => d.clave)
    if (new Set(archivos).size !== archivos.length)
      error('Hay un documento cargado dos veces', ['documentos'])
  })

export type CrearSiniestroInput = z.input<typeof crearSiniestroSchema>
export type CrearSiniestroData = z.output<typeof crearSiniestroSchema>

/** Respuesta al crear: si el aviso por mail no salió, el siniestro igual quedó creado (36.a) */
export type SiniestroCreado = { id: number; numeroSiniestro: string; correoEnviado: boolean }
