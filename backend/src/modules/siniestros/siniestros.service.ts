import type { SesionUsuario } from '@cova/shared/schemas/auth'
import {
  DIAS_DEMORADO,
  type FiltrosSiniestros,
  type OpcionesSiniestros,
  type PaginaSiniestros,
  type PartesSiniestro,
  type SiniestroListado,
} from '@cova/shared/schemas/siniestros'
import type { Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'

type BaseSiniestros = Pick<
  Prisma.TransactionClient,
  'siniestro' | 'estadoSiniestro' | 'aseguradora' | 'usuario' | '$queryRaw'
>

const DIA_MS = 24 * 60 * 60 * 1000

const nombreDe = (p: { nombres: string; apellidos: string }) => `${p.nombres} ${p.apellidos}`
const nombrePersona = (p: { nombreCompletoRazonSocial: string | null }) =>
  p.nombreCompletoRazonSocial?.trim() || 'Sin nombre'

// Asegurado: el titular del vehículo asegurado. Todas las demás personas son terceros.
function esAsegurado(p: {
  esPropietario: boolean | null
  vehiculo: { rolAccidente: string | null } | null
}) {
  return p.esPropietario === true && p.vehiculo?.rolAccidente === 'ASEGURADO'
}

const detalleListado = {
  id: true,
  numeroSiniestro: true,
  numeroPoliza: true,
  eliminado: true,
  fechaBaja: true,
  fechaAsignacion: true,
  fechaUltimoMovimiento: true,
  aseguradora: { select: { id: true, nombre: true } },
  ajustador: { select: { id: true, nombres: true, apellidos: true } },
  usuario: { select: { id: true, nombres: true, apellidos: true } },
  estadoSiniestro: { select: { id: true, nombre: true, descripcion: true, esCierre: true } },
  peritos: {
    where: { eliminado: false },
    select: { id: true, tipoPerito: true, cerrado: true },
    orderBy: [{ fechaSolicitud: 'desc' }, { id: 'desc' }],
  },
  personasInvolucradas: {
    where: { eliminado: false },
    select: {
      id: true,
      nombreCompletoRazonSocial: true,
      esPropietario: true,
      vehiculo: { select: { rolAccidente: true } },
      abogado: { select: { id: true, nombreCompleto: true } },
    },
    orderBy: { id: 'asc' },
  },
} as const satisfies Prisma.SiniestroSelect

type FilaListado = Prisma.SiniestroGetPayload<{ select: typeof detalleListado }>

function diasDesde(fecha: Date, ahora: Date) {
  return Math.max(0, Math.floor((ahora.getTime() - fecha.getTime()) / DIA_MS))
}

function aListado(fila: FilaListado, ahora: Date): SiniestroListado {
  const asegurado = fila.personasInvolucradas.find(esAsegurado) ?? null
  const abogados = new Map<number, string>()
  for (const p of fila.personasInvolucradas) {
    if (p.abogado) abogados.set(p.abogado.id, p.abogado.nombreCompleto)
  }
  const pericia = (tipo: 'CESVI' | 'MEDICO') => {
    const perito = fila.peritos.find((p) => p.tipoPerito === tipo)
    return perito ? { id: perito.id, cerrada: perito.cerrado } : null
  }
  return {
    id: fila.id,
    numeroSiniestro: fila.numeroSiniestro,
    numeroPoliza: fila.numeroPoliza,
    eliminado: fila.eliminado,
    fechaBaja: fila.fechaBaja?.toISOString() ?? null,
    asegurado: asegurado && { id: asegurado.id, nombre: nombrePersona(asegurado) },
    terceros: fila.personasInvolucradas
      .filter((p) => p !== asegurado)
      .map((p) => ({ id: p.id, nombre: nombrePersona(p) })),
    aseguradora: fila.aseguradora,
    ajustador: fila.ajustador && { id: fila.ajustador.id, nombre: nombreDe(fila.ajustador) },
    gestor: { id: fila.usuario.id, nombre: nombreDe(fila.usuario) },
    fechaAsignacion: fila.fechaAsignacion.toISOString(),
    estado: fila.estadoSiniestro,
    pericias: { cesvi: pericia('CESVI'), medico: pericia('MEDICO') },
    abogados: [...abogados].map(([id, nombre]) => ({ id, nombre })),
    // Sin movimientos registrados todavía, cuenta desde la asignación
    diasSinMovimiento: diasDesde(fila.fechaUltimoMovimiento ?? fila.fechaAsignacion, ahora),
  }
}

// RF-16: número de siniestro o de póliza, nombre o apellido de una persona, o patente. Sin distinguir mayúsculas
// ni tildes (unaccent, migración 20261020120000); las patentes, además, sin espacios ni guiones ("AE 123-CD").
async function idsQueCoinciden(prisma: BaseSiniestros, texto: string): Promise<number[]> {
  const escapar = (valor: string) => valor.replace(/[\\%_]/g, (c) => `\\${c}`)
  const patron = `%${escapar(texto)}%`
  const patente = texto.replace(/[\s-]/g, '')
  const patronPatente = patente ? `%${escapar(patente)}%` : null
  const filas = await prisma.$queryRaw<{ id: number }[]>`
    SELECT s."id" FROM "Siniestro" s
    WHERE unaccent(s."numeroSiniestro") ILIKE unaccent(${patron}::text)
       OR unaccent(s."numeroPoliza") ILIKE unaccent(${patron}::text)
       OR EXISTS (
         SELECT 1 FROM "PersonaInvolucrada" p
         LEFT JOIN "Vehiculo" v ON v."id" = p."idVehiculo"
         WHERE p."idSiniestro" = s."id" AND p."eliminado" = false
           AND (unaccent(p."nombreCompletoRazonSocial") ILIKE unaccent(${patron}::text)
                OR regexp_replace(v."dominio", '[[:space:]-]', '', 'g') ILIKE ${patronPatente}::text)
       )`
  return filas.map((f) => f.id)
}

// CU-09: listado de siniestros. El administrador y el superadministrador ven todos; el gestor, solo los
// asignados a él (RF-17), y nunca los dados de baja.
export function crearServicioSiniestros(
  prisma: BaseSiniestros,
  reloj: () => Date = () => new Date(),
) {
  const esGestor = (usuario: SesionUsuario) => usuario.tipoUsuario === 'GESTOR'

  return {
    async listar(usuario: SesionUsuario, filtros: FiltrosSiniestros): Promise<PaginaSiniestros> {
      const ahora = reloj()
      const ids = filtros.q ? await idsQueCoinciden(prisma, filtros.q) : null
      const base: Prisma.SiniestroWhereInput = {
        ...(esGestor(usuario)
          ? { idUsuario: usuario.id }
          : filtros.gestor
            ? { idUsuario: filtros.gestor }
            : {}),
        ...(filtros.estado ? { idEstadoSiniestro: filtros.estado } : {}),
        ...(filtros.aseguradora ? { idAseguradora: filtros.aseguradora } : {}),
        ...(ids ? { id: { in: ids } } : {}),
      }
      const conBajas = filtros.bajas && !esGestor(usuario)
      const where: Prisma.SiniestroWhereInput = conBajas ? base : { ...base, eliminado: false }

      // RF-19: demorado = abierto y sin movimientos en 72 h (o sin movimientos desde la asignación)
      const limite = new Date(ahora.getTime() - DIAS_DEMORADO * DIA_MS)
      const [total, activos, demorados, bajas] = await Promise.all([
        prisma.siniestro.count({ where }),
        prisma.siniestro.count({ where: { ...base, eliminado: false } }),
        prisma.siniestro.count({
          where: {
            ...base,
            eliminado: false,
            estadoSiniestro: { esCierre: false },
            OR: [
              { fechaUltimoMovimiento: { lte: limite } },
              { fechaUltimoMovimiento: null, fechaAsignacion: { lte: limite } },
            ],
          },
        }),
        esGestor(usuario) ? 0 : prisma.siniestro.count({ where: { ...base, eliminado: true } }),
      ])

      // Una página que ya no existe (p. ej. después de filtrar) muestra la última
      const paginas = Math.max(1, Math.ceil(total / filtros.porPagina))
      const pagina = Math.min(filtros.pagina, paginas)
      const orderBy: Prisma.SiniestroOrderByWithRelationInput[] =
        filtros.orden === 'demora'
          ? [
              { eliminado: 'asc' },
              // Los cerrados no se mueven más: van después de los abiertos
              { estadoSiniestro: { esCierre: 'asc' } },
              { fechaUltimoMovimiento: { sort: 'asc', nulls: 'first' } },
              { fechaAsignacion: 'asc' },
              { id: 'asc' },
            ]
          : [{ eliminado: 'asc' }, { fechaAsignacion: 'desc' }, { id: 'desc' }]
      const filas = await prisma.siniestro.findMany({
        where,
        select: detalleListado,
        orderBy,
        skip: (pagina - 1) * filtros.porPagina,
        take: filtros.porPagina,
      })
      return {
        siniestros: filas.map((fila) => aListado(fila, ahora)),
        total,
        pagina,
        porPagina: filtros.porPagina,
        resumen: { activos, demorados, bajas },
      }
    },

    async opciones(usuario: SesionUsuario): Promise<OpcionesSiniestros> {
      const [estados, aseguradoras, usuarios] = await Promise.all([
        prisma.estadoSiniestro.findMany({
          where: { eliminado: false },
          select: { id: true, nombre: true },
          orderBy: { id: 'asc' },
        }),
        prisma.aseguradora.findMany({
          select: { id: true, nombre: true, eliminado: true },
          orderBy: [{ eliminado: 'asc' }, { nombre: 'asc' }],
        }),
        esGestor(usuario)
          ? []
          : prisma.usuario.findMany({
              select: { id: true, nombres: true, apellidos: true, eliminado: true },
              orderBy: [{ eliminado: 'asc' }, { nombres: 'asc' }, { apellidos: 'asc' }],
            }),
      ])
      return {
        estados,
        aseguradoras,
        gestores: usuarios.map((u) => ({ id: u.id, nombre: nombreDe(u), eliminado: u.eliminado })),
      }
    },

    // CU-09 3.b y 3.c. Un gestor solo puede ver las partes de sus siniestros; si no es suyo, responde como si no
    // existiera.
    async partes(usuario: SesionUsuario, id: number): Promise<PartesSiniestro> {
      const fila = await prisma.siniestro.findFirst({
        where: { id, ...(esGestor(usuario) ? { idUsuario: usuario.id, eliminado: false } : {}) },
        select: {
          id: true,
          numeroSiniestro: true,
          ajustador: {
            select: {
              id: true,
              nombres: true,
              apellidos: true,
              email: true,
              telefono: true,
              aseguradora: { select: { nombre: true } },
            },
          },
          peritos: {
            where: { eliminado: false },
            orderBy: [{ fechaSolicitud: 'desc' }, { id: 'desc' }],
          },
          personasInvolucradas: {
            where: { eliminado: false },
            orderBy: { id: 'asc' },
            select: {
              id: true,
              nombreCompletoRazonSocial: true,
              documento: true,
              telefono: true,
              email: true,
              esPropietario: true,
              rolEnVehiculo: true,
              rolSinVehiculo: true,
              tipoLesion: true,
              descripcionLesiones: true,
              tipoDocumento: { select: { nombre: true } },
              vehiculo: {
                select: {
                  rolAccidente: true,
                  marca: true,
                  modelo: true,
                  anio: true,
                  dominio: true,
                },
              },
              abogado: {
                select: {
                  id: true,
                  nombreCompleto: true,
                  numeroMatricula: true,
                  telefono: true,
                  email: true,
                },
              },
            },
          },
        },
      })
      if (!fila) throw new HttpError(404, 'El siniestro no existe.')

      const abogados = new Map<number, PartesSiniestro['abogados'][number]>()
      for (const p of fila.personasInvolucradas) {
        if (!p.abogado) continue
        const abogado = abogados.get(p.abogado.id) ?? { ...p.abogado, representa: [] }
        abogado.representa.push(nombrePersona(p))
        abogados.set(p.abogado.id, abogado)
      }

      return {
        siniestro: { id: fila.id, numeroSiniestro: fila.numeroSiniestro },
        ajustador: fila.ajustador && {
          id: fila.ajustador.id,
          nombres: fila.ajustador.nombres,
          apellidos: fila.ajustador.apellidos,
          email: fila.ajustador.email,
          telefono: fila.ajustador.telefono,
          aseguradora: fila.ajustador.aseguradora.nombre,
        },
        peritos: fila.peritos.map((p) => ({
          id: p.id,
          tipo: p.tipoPerito,
          nombre: p.nombre,
          telefono: p.telefono,
          email: p.email,
          fechaSolicitud: p.fechaSolicitud.toISOString(),
          fechaCierre: p.fechaCierre?.toISOString() ?? null,
          cerrado: p.cerrado,
        })),
        abogados: [...abogados.values()],
        terceros: fila.personasInvolucradas
          .filter((p) => !esAsegurado(p))
          .map((p) => {
            const v = p.vehiculo
            return {
              id: p.id,
              nombre: nombrePersona(p),
              rol: v
                ? p.esPropietario
                  ? 'Titular del vehículo'
                  : p.rolEnVehiculo || 'Ocupante'
                : p.rolSinVehiculo,
              documento: p.documento
                ? [p.tipoDocumento?.nombre, p.documento].filter(Boolean).join(' ')
                : null,
              telefono: p.telefono,
              email: p.email,
              vehiculo: v && {
                descripcion:
                  [v.marca, v.modelo, v.anio].filter(Boolean).join(' ') || 'Vehículo sin datos',
                dominio: v.dominio,
              },
              abogado: p.abogado?.nombreCompleto ?? null,
              lesion: p.tipoLesion
                ? { tipo: p.tipoLesion, descripcion: p.descripcionLesiones }
                : null,
            }
          }),
      }
    },
  }
}
