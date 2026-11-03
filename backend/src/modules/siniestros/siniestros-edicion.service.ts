import { createHash } from 'node:crypto'
import type { SesionUsuario } from '@cova/shared/schemas/auth'
import {
  editarCasoAdministradorSchema,
  editarCasoGestorSchema,
  type DatosEdicionCaso,
  type EdicionCaso,
  type ResultadoEdicionCaso,
  type EditarCasoAdministrador,
} from '@cova/shared/schemas/edicion-caso'
import type { Prisma } from '../../generated/prisma/client.ts'
import { HttpError } from '../../utils/httpError.ts'
import { nombreCompleto } from '../../utils/formato.ts'
import { eventoHistorial } from '../historial/historial.textos.ts'

type Base = { transaccion<T>(trabajo: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> }
const persona = {
  id: true,
  nombres: true,
  apellidos: true,
  email: true,
  tipoUsuario: true,
  eliminado: true,
} as const
const seleccion = {
  id: true,
  numeroSiniestro: true,
  numeroPoliza: true,
  inicioVigencia: true,
  sucursal: true,
  idAseguradora: true,
  idAjustador: true,
  idUsuario: true,
  idDireccion: true,
  fechaOcurrencia: true,
  horaOcurrencia: true,
  menorEdadInvolucrado: true,
  causa: true,
  fechaUltimoMovimiento: true,
  eliminado: true,
  eliminacionEnCurso: true,
  estadoSiniestro: { select: { esCierre: true } },
  usuario: { select: persona },
  aseguradora: { select: { nombre: true } },
  ajustador: { select: { nombres: true, apellidos: true, idAseguradora: true } },
  direccion: { include: { provincia: { select: { nombre: true, idPais: true } } } },
} as const satisfies Prisma.SiniestroSelect
type Caso = Prisma.SiniestroGetPayload<{ select: typeof seleccion }>
const version = (caso: Caso) => createHash('sha256').update(JSON.stringify(caso)).digest('hex')
const datosDe = (s: Caso): DatosEdicionCaso => ({
  poliza: {
    numeroSiniestro: s.numeroSiniestro,
    numeroPoliza: s.numeroPoliza,
    inicioVigencia: s.inicioVigencia,
    idAseguradora: s.idAseguradora,
    sucursal: s.sucursal ?? '',
  },
  asignacion: { idAjustador: s.idAjustador },
  hecho: {
    fechaOcurrencia: s.fechaOcurrencia?.toISOString().slice(0, 10) ?? null,
    horaOcurrencia: s.horaOcurrencia?.toISOString().slice(11, 19) ?? null,
    menorEdadInvolucrado: s.menorEdadInvolucrado,
    causa: s.causa,
  },
  lugar: {
    idProvincia: s.direccion?.idProvincia ?? null,
    localidad: s.direccion?.localidad ?? null,
    calle: s.direccion?.calle ?? null,
    codigoPostal: s.direccion?.codigoPostal ?? null,
  },
})
const errorDuplicado = () =>
  new HttpError(
    409,
    'Ya existe un siniestro con este número para esta aseguradora, incluso entre los dados de baja. Corregí el número.',
    { campo: 'poliza.numeroSiniestro' },
  )
const campoError = (campo: string, mensaje: string) => new HttpError(409, mensaje, { campo })
const texto = (valor: unknown) =>
  valor === null || valor === undefined || valor === ''
    ? 'Sin especificar'
    : typeof valor === 'boolean'
      ? valor
        ? 'Sí'
        : 'No'
      : typeof valor === 'string' || typeof valor === 'number'
        ? String(valor)
        : 'Sin especificar'

export function crearServicioEdicionCaso(deps: Base, reloj = () => new Date()) {
  async function actorDe(tx: Prisma.TransactionClient, usuario: SesionUsuario) {
    const actor = await tx.usuario.findFirst({
      where: { id: usuario.id, eliminado: false },
      select: persona,
    })
    if (!actor) throw new HttpError(401, 'Tu sesión venció. Volvé a ingresar.')
    return actor
  }
  async function buscar(
    tx: Prisma.TransactionClient,
    actor: Awaited<ReturnType<typeof actorDe>>,
    id: number,
  ) {
    const s = await tx.siniestro.findUnique({ where: { id }, select: seleccion })
    if (!s) throw new HttpError(404, 'El siniestro no existe.')
    if (actor.tipoUsuario === 'GESTOR' && s.idUsuario !== actor.id)
      throw new HttpError(403, 'Este siniestro no está asignado a vos.')
    if (s.eliminado || s.eliminacionEnCurso)
      throw new HttpError(
        409,
        'No se pueden modificar los datos de un siniestro dado de baja o con eliminación pendiente.',
      )
    if (s.estadoSiniestro.esCierre)
      throw new HttpError(
        409,
        'Este siniestro está cerrado: se puede consultar, pero no modificar.',
      )
    return s
  }
  return {
    obtener(usuario: SesionUsuario, id: number): Promise<EdicionCaso> {
      return deps.transaccion(async (tx) => {
        const actor = await actorDe(tx, usuario),
          s = await buscar(tx, actor, id)
        const administra = actor.tipoUsuario !== 'GESTOR'
        const aseguradoras = administra
          ? await tx.aseguradora.findMany({
              where: { OR: [{ eliminado: false }, { id: s.idAseguradora }] },
              select: { id: true, nombre: true, eliminado: true },
              orderBy: { nombre: 'asc' },
            })
          : []
        const ajustadores = administra
          ? await tx.ajustador.findMany({
              where: {
                OR: [
                  { eliminado: false, aseguradora: { eliminado: false } },
                  ...(s.idAjustador ? [{ id: s.idAjustador }] : []),
                ],
              },
              select: {
                id: true,
                nombres: true,
                apellidos: true,
                idAseguradora: true,
                eliminado: true,
              },
              orderBy: { apellidos: 'asc' },
            })
          : []
        const paisActual = s.direccion?.provincia?.idPais
        const paises = await tx.pais.findMany({
          where: { OR: [{ eliminado: false }, ...(paisActual ? [{ id: paisActual }] : [])] },
          select: { id: true, nombre: true, eliminado: true },
          orderBy: { nombre: 'asc' },
        })
        const provincias = await tx.provincia.findMany({
          where: {
            OR: [
              { eliminado: false, pais: { eliminado: false } },
              ...(s.direccion?.idProvincia ? [{ id: s.direccion.idProvincia }] : []),
            ],
          },
          select: { id: true, nombre: true, idPais: true, eliminado: true },
          orderBy: { nombre: 'asc' },
        })
        return {
          version: version(s),
          datos: datosDe(s),
          puedeEditarAsignacion: administra,
          opciones: {
            aseguradoras,
            ajustadores: ajustadores.map((a) => ({
              id: a.id,
              nombre: nombreCompleto(a),
              idAseguradora: a.idAseguradora,
              eliminado: a.eliminado,
            })),
            paises,
            provincias,
          },
        }
      })
    },
    async modificar(
      usuario: SesionUsuario,
      id: number,
      entrada: unknown,
    ): Promise<ResultadoEdicionCaso> {
      return deps
        .transaccion(async (tx) => {
          const actor = await actorDe(tx, usuario)
          await tx.$queryRaw`SELECT "id" FROM "Siniestro" WHERE "id" = ${id} FOR UPDATE`
          const s = await buscar(tx, actor, id)
          if (
            actor.tipoUsuario === 'GESTOR' &&
            entrada &&
            typeof entrada === 'object' &&
            ('poliza' in entrada || 'asignacion' in entrada)
          )
            throw new HttpError(
              403,
              'Como gestor solo podés modificar el hecho y el lugar del siniestro. La póliza y la asignación requieren un administrador.',
            )
          const anteriores = datosDe(s)
          const completos: EditarCasoAdministrador =
            actor.tipoUsuario === 'GESTOR'
              ? {
                  ...editarCasoGestorSchema.parse(entrada),
                  poliza: anteriores.poliza,
                  asignacion: anteriores.asignacion,
                }
              : editarCasoAdministradorSchema.parse(entrada)
          if (completos.version !== version(s))
            throw new HttpError(
              409,
              'Los datos del siniestro cambiaron mientras editabas. Conservamos lo que escribiste: cancelá y volvé a abrir la edición para consultar los datos actuales.',
            )
          const datos: DatosEdicionCaso = {
            poliza: {
              ...completos.poliza,
              inicioVigencia: completos.poliza.inicioVigencia ?? null,
            },
            asignacion: {
              ...completos.asignacion,
              idAjustador: completos.asignacion.idAjustador ?? null,
            },
            hecho: {
              ...completos.hecho,
              fechaOcurrencia: completos.hecho.fechaOcurrencia ?? null,
              horaOcurrencia: completos.hecho.horaOcurrencia ?? null,
              causa: completos.hecho.causa ?? null,
            },
            lugar: {
              idProvincia: completos.lugar.idProvincia ?? null,
              localidad: completos.lugar.localidad ?? null,
              calle: completos.lugar.calle ?? null,
              codigoPostal: completos.lugar.codigoPostal ?? null,
            },
          }
          const mismaAseguradora = datos.poliza.idAseguradora === s.idAseguradora
          if (
            !mismaAseguradora &&
            !(await tx.aseguradora.findFirst({
              where: { id: datos.poliza.idAseguradora, eliminado: false },
              select: { id: true },
            }))
          )
            throw campoError(
              'poliza.idAseguradora',
              'La aseguradora elegida ya no está disponible. Elegí otra.',
            )
          if (
            await tx.siniestro.findFirst({
              where: {
                id: { not: id },
                idAseguradora: datos.poliza.idAseguradora,
                numeroSiniestro: { equals: datos.poliza.numeroSiniestro, mode: 'insensitive' },
              },
              select: { id: true },
            })
          )
            throw errorDuplicado()
          const cambiaAjustador = datos.asignacion.idAjustador !== s.idAjustador
          const ajustador = datos.asignacion.idAjustador
            ? await tx.ajustador.findFirst({
                where: {
                  id: datos.asignacion.idAjustador,
                  idAseguradora: datos.poliza.idAseguradora,
                  ...(!cambiaAjustador && mismaAseguradora ? {} : { eliminado: false }),
                },
                select: { nombres: true, apellidos: true },
              })
            : null
          if (datos.asignacion.idAjustador && !ajustador)
            throw campoError(
              'asignacion.idAjustador',
              'El ajustador no está disponible para esta aseguradora. Elegí otro o dejalo sin asignar.',
            )
          const cambiaProvincia = datos.lugar.idProvincia !== anteriores.lugar.idProvincia
          const provincia = datos.lugar.idProvincia
            ? await tx.provincia.findFirst({
                where: {
                  id: datos.lugar.idProvincia,
                  ...(cambiaProvincia ? { eliminado: false, pais: { eliminado: false } } : {}),
                },
                select: { nombre: true },
              })
            : null
          if (datos.lugar.idProvincia && !provincia)
            throw campoError(
              'lugar.idProvincia',
              'La provincia elegida ya no está disponible. Elegí otra.',
            )
          const aseguradora = await tx.aseguradora.findUniqueOrThrow({
            where: { id: datos.poliza.idAseguradora },
            select: { nombre: true },
          })
          const cambios: string[] = []
          const comparar = (etiqueta: string, antes: unknown, despues: unknown) => {
            if ((antes ?? null) !== (despues ?? null))
              cambios.push(`${etiqueta}: “${texto(antes)}” → “${texto(despues)}”`)
          }
          for (const [clave, etiqueta] of Object.entries({
            numeroSiniestro: 'Número de siniestro',
            numeroPoliza: 'Número de póliza',
            inicioVigencia: 'Inicio de vigencia',
            sucursal: 'Sucursal',
          }))
            comparar(
              etiqueta,
              anteriores.poliza[clave as keyof typeof anteriores.poliza],
              datos.poliza[clave as keyof typeof datos.poliza],
            )
          if (!mismaAseguradora)
            cambios.push(`Aseguradora: “${s.aseguradora.nombre}” → “${aseguradora.nombre}”`)
          if (cambiaAjustador)
            cambios.push(
              `Ajustador: “${s.ajustador ? nombreCompleto(s.ajustador) : 'Sin asignar'}” → “${ajustador ? nombreCompleto(ajustador) : 'Sin asignar'}”`,
            )
          for (const [clave, etiqueta] of Object.entries({
            fechaOcurrencia: 'Fecha de ocurrencia',
            horaOcurrencia: 'Hora de ocurrencia',
            menorEdadInvolucrado: 'Menor de edad involucrado',
            causa: 'Causa',
          }))
            comparar(
              etiqueta,
              anteriores.hecho[clave as keyof typeof anteriores.hecho],
              datos.hecho[clave as keyof typeof datos.hecho],
            )
          if (cambiaProvincia)
            cambios.push(
              `Provincia: “${s.direccion?.provincia?.nombre ?? 'Sin especificar'}” → “${provincia?.nombre ?? 'Sin especificar'}”`,
            )
          for (const [clave, etiqueta] of Object.entries({
            localidad: 'Localidad',
            calle: 'Calle y altura',
            codigoPostal: 'Código postal',
          }))
            comparar(
              etiqueta,
              anteriores.lugar[clave as keyof typeof anteriores.lugar],
              datos.lugar[clave as keyof typeof datos.lugar],
            )
          if (!cambios.length) return { modificado: false }
          const ahora = reloj()
          let idDireccion = s.idDireccion
          if (JSON.stringify(datos.lugar) !== JSON.stringify(anteriores.lugar)) {
            const lugar = {
              ...datos.lugar,
              pisoDepartamento: s.direccion?.pisoDepartamento ?? null,
            }
            const compartida = s.idDireccion
              ? await tx.direccion.findUniqueOrThrow({
                  where: { id: s.idDireccion },
                  select: {
                    _count: { select: { usuarios: true, siniestros: true } },
                    perito: { select: { id: true } },
                    personaInvolucrada: { select: { id: true } },
                  },
                })
              : null
            const copiar =
              !compartida ||
              compartida._count.usuarios > 0 ||
              compartida._count.siniestros > 1 ||
              compartida.perito !== null ||
              compartida.personaInvolucrada !== null
            const direccion = copiar
              ? await tx.direccion.create({ data: lugar })
              : await tx.direccion.update({ where: { id: s.idDireccion! }, data: lugar })
            idDireccion = direccion.id
          }
          await tx.siniestro.update({
            where: { id },
            data: {
              ...(actor.tipoUsuario !== 'GESTOR' ? { ...datos.poliza, ...datos.asignacion } : {}),
              ...datos.hecho,
              fechaOcurrencia: datos.hecho.fechaOcurrencia
                ? new Date(`${datos.hecho.fechaOcurrencia}T00:00:00Z`)
                : null,
              horaOcurrencia: datos.hecho.horaOcurrencia
                ? new Date(`1970-01-01T${datos.hecho.horaOcurrencia}Z`)
                : null,
              idDireccion,
              fechaUltimoMovimiento: ahora,
              demorado: false,
            },
          })
          if (cambios.length)
            await tx.historialSiniestro.create({
              data: {
                idSiniestro: id,
                idUsuario: actor.id,
                fechaEvento: ahora,
                ...eventoHistorial.modificacionDatos(cambios),
              },
            })
          return { modificado: true }
        })
        .catch((error: unknown) => {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
            throw errorDuplicado()
          throw error
        })
    },
  }
}
