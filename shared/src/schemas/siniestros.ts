import { z } from 'zod'
import {
  booleanoSchema,
  esquemaEdicion,
  fechaHoraSchema,
  fechaSchema,
  horaSchema,
  idSchema,
  opcional,
  textoSchema,
} from './comunes.ts'
import type { TipoLesion, TipoPerito } from './enums.ts'

// Datos de alta de Siniestro; id y baja lógica se gestionan por separado.
export const siniestroSchema = z.strictObject({
  numeroSiniestro: textoSchema,
  numeroPoliza: textoSchema,
  fechaAsignacion: fechaHoraSchema,
  demorado: booleanoSchema,
  menorEdadInvolucrado: booleanoSchema,
  idEstadoSiniestro: idSchema,
  idAseguradora: idSchema,
  idUsuario: idSchema,
  fechaOcurrencia: opcional(fechaSchema),
  horaOcurrencia: opcional(horaSchema),
  inicioVigencia: opcional(textoSchema),
  sucursal: opcional(textoSchema),
  causa: opcional(textoSchema),
  fechaCierre: opcional(fechaHoraSchema),
  fechaUltimoMovimiento: opcional(fechaHoraSchema),
  idAjustador: opcional(idSchema),
  idDireccion: opcional(idSchema),
})

export const siniestroUpdateSchema = esquemaEdicion(siniestroSchema)

export type SiniestroInput = z.input<typeof siniestroSchema>
export type SiniestroData = z.output<typeof siniestroSchema>
export type SiniestroUpdateInput = z.input<typeof siniestroUpdateSchema>
export type SiniestroUpdateData = z.output<typeof siniestroUpdateSchema>

// ------------------------------------------------------------------ Listado de siniestros (CU-09 paso 2, E4-01)

/** RF-19: sin movimientos en 72 h el caso está demorado. Desde 7 días, el semáforo pasa a rojo. */
export const DIAS_DEMORADO = 3
export const DIAS_ALERTA = 7

/** Tono del semáforo de días sin movimiento. Un caso cerrado ya no se mueve: no se marca. */
export function tonoDemora(dias: number, cerrado: boolean): 'normal' | 'demorado' | 'alerta' {
  if (cerrado || dias < DIAS_DEMORADO) return 'normal'
  return dias < DIAS_ALERTA ? 'demorado' : 'alerta'
}

export const POR_PAGINA = [25, 50, 100] as const
export const ordenSiniestrosSchema = z.enum(['asignacion', 'demora'])
export type OrdenSiniestros = z.infer<typeof ordenSiniestrosSchema>

const vacioComoAusente = (valor: unknown) => (valor === '' ? undefined : valor)

// Filtros del listado, tal como llegan en la dirección (?pagina=2&estado=3&q=…). Todos opcionales.
export const filtrosSiniestrosSchema = z.strictObject({
  pagina: z.preprocess(vacioComoAusente, idSchema.optional()).default(1),
  porPagina: z
    .preprocess(vacioComoAusente, z.enum(POR_PAGINA.map(String) as ['25', '50', '100']).optional())
    .transform((valor) => Number(valor ?? POR_PAGINA[0])),
  // Número de siniestro o de póliza, nombre o apellido de una persona, o patente (RF-16)
  q: z.preprocess(
    vacioComoAusente,
    z.string().trim().max(100, 'Usá como máximo 100 caracteres').optional(),
  ),
  estado: z.preprocess(vacioComoAusente, idSchema.optional()),
  aseguradora: z.preprocess(vacioComoAusente, idSchema.optional()),
  gestor: z.preprocess(vacioComoAusente, idSchema.optional()),
  bajas: z
    .preprocess(vacioComoAusente, z.enum(['true', 'false']).optional())
    .transform((valor) => valor === 'true'),
  orden: z.preprocess(vacioComoAusente, ordenSiniestrosSchema.optional()).default('asignacion'),
})
export type FiltrosSiniestros = z.output<typeof filtrosSiniestrosSchema>

export type ParteResumen = { id: number; nombre: string }

/** Fila del listado (GET /api/siniestros). Las partes se resumen; sus datos de contacto van aparte. */
export type SiniestroListado = {
  id: number
  numeroSiniestro: string
  numeroPoliza: string
  eliminado: boolean
  fechaBaja: string | null
  /** Titular del vehículo asegurado; null si no se cargó */
  asegurado: ParteResumen | null
  /** Todas las demás personas del siniestro */
  terceros: ParteResumen[]
  aseguradora: { id: number; nombre: string }
  ajustador: ParteResumen | null
  gestor: ParteResumen
  fechaAsignacion: string
  estado: { id: number; nombre: string; descripcion: string; esCierre: boolean }
  /** El perito más reciente de cada tipo, si hay */
  pericias: { cesvi: PericiaResumen | null; medico: PericiaResumen | null }
  abogados: ParteResumen[]
  diasSinMovimiento: number
}
export type PericiaResumen = { id: number; cerrada: boolean }

export type PaginaSiniestros = {
  siniestros: SiniestroListado[]
  total: number
  pagina: number
  porPagina: number
  /** Con los mismos filtros, sin contar la paginación */
  resumen: { activos: number; demorados: number; bajas: number }
}

/** Opciones de los filtros (GET /api/siniestros/opciones). Los gestores solo reciben estados y aseguradoras. */
export type OpcionesSiniestros = {
  estados: { id: number; nombre: string }[]
  aseguradoras: { id: number; nombre: string; eliminado: boolean }[]
  gestores: { id: number; nombre: string; eliminado: boolean }[]
}

/** Datos básicos de un siniestro (GET /api/siniestros/:id), para la ficha. CU-10 la va a ampliar. */
export type SiniestroResumen = {
  id: number
  numeroSiniestro: string
  numeroPoliza: string
  aseguradora: { id: number; nombre: string }
  estado: { id: number; nombre: string }
  gestor: ParteResumen
}

/** Datos de contacto de las partes (GET /api/siniestros/:id/partes), para los modales del listado (CU-09 3.b y 3.c). */
export type PartesSiniestro = {
  siniestro: { id: number; numeroSiniestro: string }
  ajustador: {
    id: number
    nombres: string
    apellidos: string
    email: string
    telefono: string
    aseguradora: string
  } | null
  peritos: {
    id: number
    tipo: TipoPerito
    nombre: string
    telefono: string | null
    email: string | null
    fechaSolicitud: string
    fechaCierre: string | null
    cerrado: boolean
  }[]
  abogados: {
    id: number
    nombreCompleto: string
    numeroMatricula: number | null
    telefono: string | null
    email: string | null
    representa: string[]
  }[]
  terceros: {
    id: number
    nombre: string
    /** "Titular del vehículo", "Ocupante", "Peatón", "Testigo"… */
    rol: string | null
    documento: string | null
    telefono: string | null
    email: string | null
    vehiculo: { descripcion: string; dominio: string } | null
    abogado: string | null
    lesion: { tipo: TipoLesion; descripcion: string | null } | null
  }[]
}
